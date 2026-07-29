// =============================================================================
// Runtime Sync
// =============================================================================
//
// Owns every server-facing concern of the native runtime: endpoint/session
// resolution, the health poll, the server-sent event stream, and annotation
// upload. `NativeAgentation` is the only consumer; it hands local state in and
// receives remote state back through the dependency callbacks, so this module
// never touches the DOM, storage keys, or the view.
//
// Two invariants hold everywhere below:
//   1. Nothing reaches for an ambient realm global — network, timers, abort
//      controllers and server-sent events all come from the injected
//      `RuntimeEnvironment` / `UnfrozenScheduler`.
//   2. Every `await` is followed by a generation/destroyed guard before any
//      observable effect, so a reconfigure or teardown mid-flight can never be
//      overwritten by the request it superseded.
// =============================================================================

import type { Annotation } from "../types";
import {
  createSession,
  deleteAnnotation,
  getSession,
  requestAction,
  syncAnnotation,
  updateAnnotation,
} from "../utils/sync";
import type { UnfrozenScheduler } from "../utils/freeze-animations";
import type { RuntimeEnvironment } from "./environment";
import type { RuntimeStorage } from "./storage";
import type { AgentationConfig } from "./types";

export type ConnectionStatus = "disconnected" | "connecting" | "connected";

export type RemoteRemovalKind = "feedback" | "placement" | "rearrange";

export type RuntimeSyncDependencies = {
  readonly environment: RuntimeEnvironment;
  readonly scheduler: UnfrozenScheduler;
  /** Upsert set: the runtime merges these records by id, never wholesale. */
  readonly onRemoteAnnotations: (annotations: readonly Annotation[]) => void;
  readonly onRemoteRemoved: (id: string, kind: RemoteRemovalKind) => void;
  readonly onConnectionChange: (status: ConnectionStatus) => void;
  readonly onSessionCreated: (sessionId: string) => void;
  readonly onError: (message: string, cause: unknown) => void;
  readonly localAnnotations: () => readonly Annotation[];
  readonly storage: RuntimeStorage;
};

export interface RuntimeSync {
  readonly sessionId: string | null;
  readonly status: ConnectionStatus;
  configure(
    config: Pick<AgentationConfig, "endpoint" | "sessionId">,
    pathname: string,
    snapshot: readonly Annotation[],
  ): Promise<void>;
  add(annotation: Annotation): Promise<void>;
  update(annotation: Annotation): Promise<void>;
  delete(annotationId: string): Promise<void>;
  clear(annotationIds: readonly string[]): Promise<void>;
  action(output: string): Promise<boolean>;
  destroy(): void;
}

const HEALTH_INTERVAL_MS = 10000;

const REMOVED_STATUSES = ["resolved", "dismissed"];

function isRenderable(annotation: Annotation): boolean {
  return annotation.status !== "resolved" && annotation.status !== "dismissed";
}

/** Server payload shape carried by the `annotation.updated` event. */
type RemoteUpdatePayload = {
  id?: unknown;
  kind?: unknown;
  status?: unknown;
};

function removalKind(value: unknown): RemoteRemovalKind {
  return value === "placement" || value === "rearrange" ? value : "feedback";
}

class RuntimeSyncImpl implements RuntimeSync {
  private readonly dependencies: RuntimeSyncDependencies;
  private readonly environment: RuntimeEnvironment;
  private readonly storage: RuntimeStorage;

  private generation = 0;
  private destroyed = false;
  private controller: AbortController | undefined;

  private endpoint: string | undefined;
  private pathname = "";
  private currentSessionId: string | null = null;
  private state: ConnectionStatus = "disconnected";
  /**
   * Set when an explicitly requested session could not be joined. Creating a
   * different session would strand the consumer's annotations somewhere nobody
   * asked for, so the runtime stays local-only until the next `configure`.
   */
  private localOnly = false;

  private healthHandle: number | undefined;
  private events: EventSource | undefined;
  private eventsSessionId: string | null = null;

  constructor(dependencies: RuntimeSyncDependencies) {
    this.dependencies = dependencies;
    this.environment = dependencies.environment;
    this.storage = dependencies.storage;
  }

  get sessionId(): string | null {
    return this.currentSessionId;
  }

  get status(): ConnectionStatus {
    return this.state;
  }

  // --- Lifecycle ------------------------------------------------------------

  async configure(
    config: Pick<AgentationConfig, "endpoint" | "sessionId">,
    pathname: string,
    snapshot: readonly Annotation[],
  ): Promise<void> {
    const generation = this.begin();
    if (this.destroyed) return;

    this.pathname = pathname;
    this.endpoint = config.endpoint;
    this.localOnly = false;

    if (!this.endpoint) {
      this.currentSessionId = null;
      this.setStatus("disconnected");
      return;
    }

    this.setStatus("connecting");
    await this.resolveSession(config.sessionId, snapshot, generation);
    if (this.stale(generation)) return;
    // A local-only runtime polls nothing and listens to nothing, so its status
    // stays honestly "disconnected" until the consumer reconfigures.
    if (this.localOnly) return;

    this.openEvents();
    this.startHealth(generation);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.generation += 1;
    this.controller?.abort();
    this.controller = undefined;
    this.stopHealth();
    this.closeEvents();
    this.state = "disconnected";
  }

  // --- Mutations ------------------------------------------------------------

  async add(annotation: Annotation): Promise<void> {
    const endpoint = this.endpoint;
    const sessionId = this.currentSessionId;
    if (!endpoint || !sessionId) return;
    const generation = this.generation;

    try {
      const synced = await syncAnnotation(
        endpoint,
        sessionId,
        { ...annotation, sessionId, url: this.pageUrl(this.pathname) },
        this.signal(),
      );
      if (this.stale(generation)) return;
      if (synced.id !== annotation.id) {
        // The server renamed the record: retire the local id, which now exists
        // nowhere upstream, before merging the authoritative one — otherwise the
        // runtime renders two markers for a single annotation.
        this.dependencies.onRemoteRemoved(annotation.id, removalKind(annotation.kind));
        this.dependencies.onRemoteAnnotations([synced]);
      }
    } catch (cause) {
      if (this.stale(generation)) return;
      this.dependencies.onError("Failed to sync annotation; it remains stored locally", cause);
    }
  }

  async update(annotation: Annotation): Promise<void> {
    const endpoint = this.endpoint;
    if (!endpoint || !this.currentSessionId) return;
    const generation = this.generation;

    try {
      await updateAnnotation(
        endpoint,
        annotation.id,
        { comment: annotation.comment },
        this.signal(),
      );
    } catch (cause) {
      if (this.stale(generation)) return;
      this.dependencies.onError("Failed to update annotation on server", cause);
    }
  }

  async delete(annotationId: string): Promise<void> {
    const endpoint = this.endpoint;
    if (!endpoint || !this.currentSessionId) return;
    const generation = this.generation;

    try {
      await deleteAnnotation(endpoint, annotationId, this.signal());
    } catch (cause) {
      if (this.stale(generation)) return;
      this.dependencies.onError("Failed to delete annotation from server", cause);
    }
  }

  async clear(annotationIds: readonly string[]): Promise<void> {
    const endpoint = this.endpoint;
    if (!endpoint || !this.currentSessionId) return;
    if (annotationIds.length === 0) return;
    const generation = this.generation;
    const signal = this.signal();

    const results = await Promise.allSettled(
      annotationIds.map((id) => deleteAnnotation(endpoint, id, signal)),
    );
    if (this.stale(generation)) return;
    for (const result of results) {
      if (result.status === "rejected") {
        this.dependencies.onError("Failed to delete annotation from server", result.reason);
      }
    }
  }

  async action(output: string): Promise<boolean> {
    const endpoint = this.endpoint;
    const sessionId = this.currentSessionId;
    if (!endpoint || !sessionId) return false;
    const generation = this.generation;

    try {
      await requestAction(endpoint, sessionId, output, this.signal());
      return !this.stale(generation);
    } catch (cause) {
      if (!this.stale(generation)) {
        this.dependencies.onError("Failed to send annotations to the agent", cause);
      }
      return false;
    }
  }

  // --- Session resolution ---------------------------------------------------

  private async resolveSession(
    explicitSessionId: string | undefined,
    snapshot: readonly Annotation[],
    generation: number,
  ): Promise<void> {
    const endpoint = this.endpoint;
    if (!endpoint) return;

    const storedSessionId = explicitSessionId ? null : this.storage.loadSessionId(this.pathname);
    const sessionIdToJoin = explicitSessionId ?? storedSessionId;

    if (sessionIdToJoin) {
      try {
        const session = await getSession(endpoint, sessionIdToJoin, this.signal());
        if (this.stale(generation)) return;
        // Joining is not creating: no `onSessionCreated`, no `session-created`.
        this.adoptSession(session.id);
        await this.mergeJoinedSession(session.annotations, snapshot, session.id, generation);
        return;
      } catch (cause) {
        if (this.stale(generation)) return;
        if (explicitSessionId) {
          this.currentSessionId = null;
          this.localOnly = true;
          this.setStatus("disconnected");
          this.dependencies.onError(
            "Could not join the requested Agentation session; continuing locally",
            cause,
          );
          return;
        }
        // A stored id that no longer resolves is stale, not authoritative.
        this.storage.clearSessionId(this.pathname);
      }
    }

    try {
      const session = await createSession(endpoint, this.environment.href, this.signal());
      if (this.stale(generation)) return;
      this.adoptSession(session.id);
      this.dependencies.onSessionCreated(session.id);
      await this.uploadUnsyncedPages(session.id, generation);
    } catch (cause) {
      if (this.stale(generation)) return;
      this.currentSessionId = null;
      this.setStatus("disconnected");
      this.dependencies.onError("Could not initialize Agentation sync; continuing locally", cause);
    }
  }

  /** Server records win for the same id; local-only records are uploaded. */
  private async mergeJoinedSession(
    remote: readonly Annotation[],
    snapshot: readonly Annotation[],
    sessionId: string,
    generation: number,
  ): Promise<void> {
    const endpoint = this.endpoint;
    if (!endpoint) return;

    const remoteIds = new Set(remote.map((annotation) => annotation.id));
    const missing = snapshot.filter((annotation) => !remoteIds.has(annotation.id));
    const uploaded = await this.uploadAnnotations(
      endpoint,
      sessionId,
      missing,
      this.pageUrl(this.pathname),
    );
    if (this.stale(generation)) return;

    const merged = [...remote, ...uploaded].filter(isRenderable);
    this.storage.saveAnnotations(this.pathname, merged, sessionId);
    this.dependencies.onRemoteAnnotations(merged);
  }

  /**
   * A freshly created session has no history, so annotations captured while
   * offline — on this page and on every other visited page — belong to it.
   */
  private async uploadUnsyncedPages(sessionId: string, generation: number): Promise<void> {
    const endpoint = this.endpoint;
    if (!endpoint) return;

    const pending: Promise<void>[] = [];
    for (const pagePath of this.storage.loadAllAnnotations().keys()) {
      const unsynced = this.storage.getUnsyncedAnnotations(pagePath);
      if (unsynced.length === 0) continue;

      const pageUrl = this.pageUrl(pagePath);
      const isCurrentPage = pagePath === this.pathname;
      pending.push(
        (async () => {
          try {
            // A session is scoped to one URL, so foreign pages get their own.
            const targetSessionId = isCurrentPage
              ? sessionId
              : (await createSession(endpoint, pageUrl, this.signal())).id;
            if (this.stale(generation)) return;

            const synced = await this.uploadAnnotations(
              endpoint,
              targetSessionId,
              unsynced,
              pageUrl,
            );
            if (this.stale(generation)) return;

            const renderable = synced.filter(isRenderable);
            this.storage.saveAnnotations(pagePath, renderable, targetSessionId);
            if (isCurrentPage) this.dependencies.onRemoteAnnotations(renderable);
          } catch (cause) {
            if (this.stale(generation)) return;
            this.dependencies.onError(`Failed to sync annotations for ${pagePath}`, cause);
          }
        })(),
      );
    }
    await Promise.allSettled(pending);
  }

  /**
   * Uploads every annotation, substituting the local record for any individual
   * failure so one rejected request never drops local state.
   */
  private async uploadAnnotations(
    endpoint: string,
    sessionId: string,
    annotations: readonly Annotation[],
    pageUrl: string,
  ): Promise<Annotation[]> {
    if (annotations.length === 0) return [];
    const signal = this.signal();
    const results = await Promise.allSettled(
      annotations.map((annotation) =>
        syncAnnotation(endpoint, sessionId, { ...annotation, sessionId, url: pageUrl }, signal),
      ),
    );
    return results.map((result, index) =>
      result.status === "fulfilled" ? result.value : annotations[index],
    );
  }

  private adoptSession(sessionId: string): void {
    this.currentSessionId = sessionId;
    this.storage.saveSessionId(this.pathname, sessionId);
    this.setStatus("connected");
  }

  // --- Health ---------------------------------------------------------------

  private startHealth(generation: number): void {
    this.stopHealth();
    void this.checkHealth(generation);
    this.healthHandle = this.dependencies.scheduler.setInterval(() => {
      if (this.stale(generation)) {
        this.stopHealth();
        return;
      }
      void this.checkHealth(generation);
    }, HEALTH_INTERVAL_MS);
  }

  private stopHealth(): void {
    if (this.healthHandle === undefined) return;
    this.dependencies.scheduler.clearInterval(this.healthHandle);
    this.healthHandle = undefined;
  }

  private async checkHealth(generation: number): Promise<void> {
    const endpoint = this.endpoint;
    if (!endpoint || this.stale(generation)) return;

    let reachable = false;
    try {
      const response = await this.environment.fetch(`${endpoint}/health`, {
        signal: this.signal(),
      });
      reachable = response.ok;
    } catch {
      reachable = false;
    }
    if (this.stale(generation)) return;

    const wasDisconnected = this.state === "disconnected";
    this.setStatus(reachable ? "connected" : "disconnected");
    if (reachable && wasDisconnected) void this.recover(generation);
  }

  /**
   * Disconnected -> connected: the session may have expired while we were away,
   * and anything captured offline is still local-only.
   */
  private async recover(generation: number): Promise<void> {
    const endpoint = this.endpoint;
    if (!endpoint || this.localOnly) return;

    try {
      let sessionId = this.currentSessionId;
      let remote: readonly Annotation[] = [];

      if (sessionId) {
        try {
          const session = await getSession(endpoint, sessionId, this.signal());
          if (this.stale(generation)) return;
          remote = session.annotations;
        } catch {
          if (this.stale(generation)) return;
          sessionId = null;
        }
      }

      if (!sessionId) {
        const created = await createSession(endpoint, this.pageUrl(this.pathname), this.signal());
        if (this.stale(generation)) return;
        sessionId = created.id;
        this.adoptSession(sessionId);
        this.dependencies.onSessionCreated(sessionId);
        this.openEvents();
      }

      const local = this.dependencies.localAnnotations();
      const remoteIds = new Set(remote.map((annotation) => annotation.id));
      const missing = local.filter((annotation) => !remoteIds.has(annotation.id));
      if (missing.length === 0) return;

      const uploaded = await this.uploadAnnotations(
        endpoint,
        sessionId,
        missing,
        this.pageUrl(this.pathname),
      );
      if (this.stale(generation)) return;

      const merged = [...remote, ...uploaded].filter(isRenderable);
      this.storage.saveAnnotations(this.pathname, merged, sessionId);
      this.dependencies.onRemoteAnnotations(merged);
    } catch (cause) {
      if (this.stale(generation)) return;
      this.dependencies.onError("Failed to sync annotations on reconnect", cause);
    }
  }

  // --- Server-sent events ---------------------------------------------------

  private openEvents(): void {
    const Source = this.environment.EventSource;
    const endpoint = this.endpoint;
    const sessionId = this.currentSessionId;
    // Environments without server-sent events (jsdom) degrade to poll-only.
    if (!Source || !endpoint || !sessionId || this.destroyed) return;
    if (this.events && this.eventsSessionId === sessionId) return;

    this.closeEvents();
    const source = new Source(`${endpoint}/sessions/${sessionId}/events`);
    source.addEventListener("annotation.updated", this.handleRemoteUpdate);
    this.events = source;
    this.eventsSessionId = sessionId;
  }

  private closeEvents(): void {
    if (!this.events) return;
    this.events.removeEventListener("annotation.updated", this.handleRemoteUpdate);
    this.events.close();
    this.events = undefined;
    this.eventsSessionId = null;
  }

  private readonly handleRemoteUpdate = (event: Event): void => {
    if (this.destroyed) return;
    let payload: RemoteUpdatePayload | undefined;
    try {
      payload = JSON.parse((event as MessageEvent<string>).data)?.payload;
    } catch {
      return; // Malformed frames are not worth surfacing to the consumer.
    }
    if (!payload || typeof payload.id !== "string") return;
    if (!REMOVED_STATUSES.includes(payload.status as string)) return;
    this.dependencies.onRemoteRemoved(payload.id, removalKind(payload.kind));
  };

  // --- Internals ------------------------------------------------------------

  /** Invalidates in-flight work and returns the generation that now owns it. */
  private begin(): number {
    this.controller?.abort();
    this.generation += 1;
    this.stopHealth();
    this.closeEvents();
    this.controller = this.destroyed ? undefined : new this.environment.AbortController();
    return this.generation;
  }

  private signal(): AbortSignal | undefined {
    return this.controller?.signal;
  }

  private stale(generation: number): boolean {
    return this.destroyed || generation !== this.generation;
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.state === status) return;
    this.state = status;
    this.dependencies.onConnectionChange(status);
  }

  private pageUrl(pathname: string): string {
    // `href` carries query/hash, which would fork one page into many sessions;
    // the origin comes from the owning realm, never the ambient one.
    return `${this.environment.window.location.origin}${pathname}`;
  }
}

export function createRuntimeSync(dependencies: RuntimeSyncDependencies): RuntimeSync {
  return new RuntimeSyncImpl(dependencies);
}

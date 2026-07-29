import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRuntimeSync } from "./sync";
import type { RuntimeSyncDependencies } from "./sync";
import type { RuntimeEnvironment } from "./environment";
import type { RuntimeStorage } from "./storage";
import {
  createSession,
  deleteAnnotation,
  getSession,
  requestAction,
  syncAnnotation,
  updateAnnotation,
} from "../utils/sync";
import type { UnfrozenScheduler } from "../utils/freeze-animations";
import type { Annotation } from "../types";

const ENDPOINT = "http://localhost:7788";

function annotation(id: string, overrides: Partial<Annotation> = {}): Annotation {
  return {
    id,
    x: 10,
    y: 20,
    comment: `comment ${id}`,
    element: "button",
    elementPath: "body > button",
    timestamp: 1,
    ...overrides,
  };
}

type Route = (url: string, init?: RequestInit) => unknown;

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as Response;
}

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly listeners = new Map<string, Set<EventListener>>();
  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string, data: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data } as MessageEvent as Event);
    }
  }
}

type Harness = {
  dependencies: RuntimeSyncDependencies;
  route: (pattern: string, handler: Route) => void;
  requests: Array<{ url: string; method: string; body: unknown; aborted: () => boolean }>;
  interval: () => (() => void) | undefined;
  sessions: Map<string, string>;
  stored: Map<string, Annotation[]>;
  saved: Array<{ pathname: string; annotations: readonly Annotation[]; sessionId?: string }>;
  events: () => FakeEventSource[];
  settle: (ready?: () => boolean) => Promise<void>;
};

function createHarness(): Harness {
  const routes: Array<{ pattern: string; handler: Route }> = [];
  const requests: Harness["requests"] = [];
  const sessions = new Map<string, string>();
  const stored = new Map<string, Annotation[]>();
  const saved: Harness["saved"] = [];
  let intervalCallback: (() => void) | undefined;

  const router = (url: string, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? "GET";
    const signal = init?.signal;
    requests.push({
      url,
      method,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      aborted: () => signal?.aborted === true,
    });
    // Most specific route wins: longest suffix match, then longest substring.
    const longest = (candidates: typeof routes) =>
      candidates.sort((a, b) => b.pattern.length - a.pattern.length)[0];
    const match =
      longest(routes.filter((entry) => url.endsWith(entry.pattern))) ??
      longest(routes.filter((entry) => url.includes(entry.pattern)));
    if (!match) return Promise.resolve(jsonResponse({}, false));
    const result = match.handler(url, init);
    return Promise.resolve(result as Response | Promise<Response>);
  };

  // `utils/sync` uses the ambient `fetch` by design; the runtime's own requests
  // (health) go through the environment. Both land in the same router here.
  vi.stubGlobal("fetch", router);

  const environment = {
    href: "http://localhost/page?query=1#hash",
    pathname: "/page",
    window: { location: { origin: "http://localhost" } },
    AbortController,
    EventSource: FakeEventSource as unknown as typeof EventSource,
    fetch: router,
  } as unknown as RuntimeEnvironment;

  const scheduler = {
    setInterval: ((handler: () => void) => {
      intervalCallback = handler;
      return 42;
    }) as unknown as UnfrozenScheduler["setInterval"],
    clearInterval: (() => {
      intervalCallback = undefined;
    }) as unknown as UnfrozenScheduler["clearInterval"],
    setTimeout: (() => 0) as unknown as UnfrozenScheduler["setTimeout"],
    clearTimeout: (() => undefined) as unknown as UnfrozenScheduler["clearTimeout"],
    requestAnimationFrame: (() => 0) as unknown as UnfrozenScheduler["requestAnimationFrame"],
    cancelAnimationFrame: (() => undefined) as unknown as UnfrozenScheduler["cancelAnimationFrame"],
  } satisfies UnfrozenScheduler;

  const storage = {
    loadSessionId: (pathname: string) => sessions.get(pathname) ?? null,
    saveSessionId: (pathname: string, sessionId: string) => {
      sessions.set(pathname, sessionId);
    },
    clearSessionId: (pathname: string) => {
      sessions.delete(pathname);
    },
    loadAnnotations: (pathname: string) => stored.get(pathname) ?? [],
    saveAnnotations: (
      pathname: string,
      annotations: readonly Annotation[],
      sessionId?: string,
    ) => {
      saved.push({ pathname, annotations, sessionId });
      stored.set(
        pathname,
        annotations.map((item) => ({ ...item, _syncedTo: sessionId })),
      );
    },
    loadAllAnnotations: () => new Map(stored),
    getUnsyncedAnnotations: (pathname: string) =>
      (stored.get(pathname) ?? []).filter((item) => !item._syncedTo),
  } as unknown as RuntimeStorage;

  const dependencies: RuntimeSyncDependencies = {
    environment,
    scheduler,
    onRemoteAnnotations: vi.fn(),
    onRemoteRemoved: vi.fn(),
    onConnectionChange: vi.fn(),
    onSessionCreated: vi.fn(),
    onError: vi.fn(),
    localAnnotations: vi.fn(() => [] as readonly Annotation[]),
    storage,
  };

  return {
    dependencies,
    route: (pattern, handler) => routes.push({ pattern, handler }),
    requests,
    interval: () => intervalCallback,
    sessions,
    stored,
    saved,
    events: () => FakeEventSource.instances,
    // Fire-and-forget chains (the health probe and the recovery it triggers)
    // settle on the microtask queue, so ticking it is deterministic and costs
    // no wall-clock time. A predicate turns "never settled" into a real error
    // instead of a downstream assertion mystery.
    settle: async (ready?: () => boolean) => {
      for (let tick = 0; tick < 200; tick += 1) {
        if (ready?.()) return;
        await Promise.resolve();
      }
      if (ready && !ready()) throw new Error("sync work never settled");
    },
  };
}

beforeEach(() => {
  FakeEventSource.instances = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createRuntimeSync session resolution", () => {
  it("joins a stored session without announcing a creation and merges both directions", async () => {
    const harness = createHarness();
    harness.sessions.set("/page", "sess_stored");
    harness.route("/sessions/sess_stored", () =>
      jsonResponse({
        id: "sess_stored",
        annotations: [
          annotation("remote-1", { comment: "server wins" }),
          annotation("resolved-1", { status: "resolved" }),
        ],
      }),
    );
    harness.route("/sessions/sess_stored/annotations", (_url, init) =>
      jsonResponse(JSON.parse(String(init?.body))),
    );
    harness.route("/health", () => jsonResponse({ ok: true }));

    const sync = createRuntimeSync(harness.dependencies);
    await sync.configure({ endpoint: ENDPOINT }, "/page", [
      annotation("remote-1", { comment: "local loses" }),
      annotation("local-1"),
    ]);

    expect(sync.sessionId).toBe("sess_stored");
    expect(sync.status).toBe("connected");
    expect(harness.dependencies.onSessionCreated).not.toHaveBeenCalled();

    const uploads = harness.requests.filter((request) => request.method === "POST");
    expect(uploads).toHaveLength(1);
    expect((uploads[0].body as Annotation).id).toBe("local-1");
    // The upload carries the session and an origin+pathname URL, never the
    // query/hash-bearing href.
    expect((uploads[0].body as Annotation).url).toBe("http://localhost/page");
    expect((uploads[0].body as Annotation).sessionId).toBe("sess_stored");

    const merged = vi.mocked(harness.dependencies.onRemoteAnnotations).mock.calls[0][0];
    expect(merged.map((item) => item.id)).toEqual(["remote-1", "local-1"]);
    expect(merged[0].comment).toBe("server wins");
    expect(harness.saved[0]).toMatchObject({ pathname: "/page", sessionId: "sess_stored" });
  });

  it("keeps an unjoinable explicit session local-only instead of creating another", async () => {
    const harness = createHarness();
    harness.route("/sessions/sess_explicit", () => jsonResponse({}, false));
    harness.route("/sessions", () => jsonResponse({ id: "sess_new" }));
    harness.route("/health", () => jsonResponse({ ok: true }));

    const sync = createRuntimeSync(harness.dependencies);
    await sync.configure({ endpoint: ENDPOINT, sessionId: "sess_explicit" }, "/page", []);
    await harness.settle();

    expect(sync.sessionId).toBeNull();
    expect(sync.status).toBe("disconnected");
    expect(harness.dependencies.onError).toHaveBeenCalledWith(
      "Could not join the requested Agentation session; continuing locally",
      expect.anything(),
    );
    expect(harness.dependencies.onSessionCreated).not.toHaveBeenCalled();
    expect(harness.requests.filter((request) => request.method === "POST")).toHaveLength(0);
    expect(harness.interval()).toBeUndefined();
    expect(harness.events()).toHaveLength(0);
  });

  it("replaces a stale stored session and uploads unsynced annotations from every pathname", async () => {
    const harness = createHarness();
    harness.sessions.set("/page", "sess_gone");
    harness.stored.set("/page", [annotation("local-1")]);
    harness.stored.set("/other", [annotation("other-1"), annotation("synced", { _syncedTo: "x" })]);
    harness.route("/sessions/sess_gone", () => jsonResponse({}, false));
    harness.route("/sessions", (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { url: string };
      return jsonResponse({ id: body.url.endsWith("/other") ? "sess_other" : "sess_new" });
    });
    harness.route("/annotations", (_url, init) => jsonResponse(JSON.parse(String(init?.body))));
    harness.route("/health", () => jsonResponse({ ok: true }));

    const sync = createRuntimeSync(harness.dependencies);
    await sync.configure({ endpoint: ENDPOINT }, "/page", []);
    await harness.settle();

    expect(harness.sessions.get("/page")).toBe("sess_new");
    expect(harness.dependencies.onSessionCreated).toHaveBeenCalledTimes(1);
    expect(harness.dependencies.onSessionCreated).toHaveBeenCalledWith("sess_new");
    // The current page reuses the new session; the foreign page gets its own.
    expect(
      harness.requests.find((request) => request.url === `${ENDPOINT}/sessions`)?.body,
    ).toEqual({ url: "http://localhost/page?query=1#hash" });
    expect(
      harness.requests.some(
        (request) => request.url === `${ENDPOINT}/sessions/sess_other/annotations`,
      ),
    ).toBe(true);
    expect(
      harness.requests.some(
        (request) => request.url === `${ENDPOINT}/sessions/sess_new/annotations`,
      ),
    ).toBe(true);
    expect(harness.saved.map((entry) => entry.sessionId)).toContain("sess_other");
    expect(harness.saved.some((entry) => entry.annotations.some((a) => a.id === "synced"))).toBe(
      false,
    );
  });

  it("reports an unreachable endpoint once and stays local", async () => {
    const harness = createHarness();
    harness.route("/sessions", () => Promise.reject(new Error("offline")));
    harness.route("/health", () => Promise.reject(new Error("offline")));

    const sync = createRuntimeSync(harness.dependencies);
    await sync.configure({ endpoint: ENDPOINT }, "/page", []);
    await harness.settle();

    expect(sync.sessionId).toBeNull();
    expect(sync.status).toBe("disconnected");
    expect(harness.dependencies.onError).toHaveBeenCalledWith(
      "Could not initialize Agentation sync; continuing locally",
      expect.anything(),
    );
  });

  it("clears the session when reconfigured without an endpoint", async () => {
    const harness = createHarness();
    harness.route("/sessions", () => jsonResponse({ id: "sess_new" }));
    harness.route("/health", () => jsonResponse({ ok: true }));

    const sync = createRuntimeSync(harness.dependencies);
    await sync.configure({ endpoint: ENDPOINT }, "/page", []);
    await harness.settle();
    expect(sync.sessionId).toBe("sess_new");

    await sync.configure({}, "/page", []);
    expect(sync.sessionId).toBeNull();
    expect(sync.status).toBe("disconnected");
    expect(harness.events()[0].closed).toBe(true);
    expect(harness.interval()).toBeUndefined();
  });
});

describe("createRuntimeSync generation guards", () => {
  it("lets a superseding configure win and aborts the request it replaced", async () => {
    const harness = createHarness();
    let releaseFirst: (() => void) | undefined;
    harness.route("/sessions/sess_slow", async () => {
      // `Promise.withResolvers` is not in this project's ES2020 lib.
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      return jsonResponse({ id: "sess_slow", annotations: [annotation("stale-1")] });
    });
    harness.route("/sessions/sess_fast", () =>
      jsonResponse({ id: "sess_fast", annotations: [annotation("fresh-1")] }),
    );
    harness.route("/health", () => jsonResponse({ ok: true }));

    const sync = createRuntimeSync(harness.dependencies);
    const first = sync.configure({ endpoint: ENDPOINT, sessionId: "sess_slow" }, "/page", []);
    await harness.settle();

    await sync.configure({ endpoint: ENDPOINT, sessionId: "sess_fast" }, "/page", []);
    releaseFirst?.();
    await first;
    await harness.settle();

    expect(harness.requests[0].aborted()).toBe(true);
    expect(sync.sessionId).toBe("sess_fast");
    const emitted = vi.mocked(harness.dependencies.onRemoteAnnotations).mock.calls;
    expect(emitted).toHaveLength(1);
    expect(emitted[0][0].map((item) => item.id)).toEqual(["fresh-1"]);
  });

  it("makes every completion after destroy a no-op and is idempotent", async () => {
    const harness = createHarness();
    let releaseJoin: (() => void) | undefined;
    harness.route("/sessions/sess_slow", async () => {
      // `Promise.withResolvers` is not in this project's ES2020 lib.
      await new Promise<void>((resolve) => {
        releaseJoin = resolve;
      });
      return jsonResponse({ id: "sess_slow", annotations: [annotation("late-1")] });
    });
    harness.route("/health", () => jsonResponse({ ok: true }));

    const sync = createRuntimeSync(harness.dependencies);
    const pending = sync.configure({ endpoint: ENDPOINT, sessionId: "sess_slow" }, "/page", []);
    await harness.settle();

    sync.destroy();
    sync.destroy();
    releaseJoin?.();
    await pending;
    await harness.settle();

    expect(harness.requests[0].aborted()).toBe(true);
    expect(harness.dependencies.onRemoteAnnotations).not.toHaveBeenCalled();
    expect(harness.dependencies.onError).not.toHaveBeenCalled();
    expect(harness.saved).toHaveLength(0);
    expect(harness.interval()).toBeUndefined();
    expect(sync.status).toBe("disconnected");
  });
});

describe("createRuntimeSync health and recovery", () => {
  it("reconnects, recreates an expired session and uploads what the server lacks", async () => {
    const harness = createHarness();
    let healthy = false;
    let sessionAlive = true;
    harness.sessions.set("/page", "sess_first");
    harness.route("/health", () => jsonResponse({}, healthy));
    harness.route("/sessions/sess_first", () =>
      sessionAlive ? jsonResponse({ id: "sess_first", annotations: [] }) : jsonResponse({}, false),
    );
    harness.route("/sessions", () => jsonResponse({ id: "sess_second" }));
    harness.route("/annotations", (_url, init) => jsonResponse(JSON.parse(String(init?.body))));

    const local = [annotation("local-1")];
    vi.mocked(harness.dependencies.localAnnotations).mockReturnValue(local);

    const sync = createRuntimeSync(harness.dependencies);
    await sync.configure({ endpoint: ENDPOINT }, "/page", []);
    await harness.settle();

    // The immediate health probe failed, so the connected join degrades.
    expect(sync.status).toBe("disconnected");
    expect(harness.dependencies.onConnectionChange).toHaveBeenLastCalledWith("disconnected");

    healthy = true;
    sessionAlive = false;
    harness.interval()?.();
    await harness.settle(() => sync.sessionId === "sess_second");
    await harness.settle(
      () => vi.mocked(harness.dependencies.onRemoteAnnotations).mock.calls.length > 1,
    );

    expect(sync.status).toBe("connected");
    expect(sync.sessionId).toBe("sess_second");
    expect(harness.sessions.get("/page")).toBe("sess_second");
    expect(
      harness.requests.some(
        (request) => request.url === `${ENDPOINT}/sessions/sess_second/annotations`,
      ),
    ).toBe(true);
    const lastEmit = vi.mocked(harness.dependencies.onRemoteAnnotations).mock.calls.at(-1);
    expect(lastEmit?.[0].map((item) => item.id)).toEqual(["local-1"]);
    expect(harness.events().at(-1)?.url).toBe(`${ENDPOINT}/sessions/sess_second/events`);
  });

  it("reports failure to recover without discarding local state", async () => {
    const harness = createHarness();
    let healthy = false;
    harness.sessions.set("/page", "sess_first");
    harness.route("/health", () => jsonResponse({}, healthy));
    harness.route("/sessions/sess_first", () => jsonResponse({ id: "sess_first", annotations: [] }));
    harness.route("/annotations", () => Promise.reject(new Error("offline")));
    vi.mocked(harness.dependencies.localAnnotations).mockReturnValue([annotation("local-1")]);

    const sync = createRuntimeSync(harness.dependencies);
    await sync.configure({ endpoint: ENDPOINT }, "/page", []);
    await harness.settle();

    healthy = true;
    harness.interval()?.();
    await harness.settle(
      () => vi.mocked(harness.dependencies.onRemoteAnnotations).mock.calls.length > 1,
    );

    // A rejected upload keeps the local record in the merged, persisted set.
    const lastEmit = vi.mocked(harness.dependencies.onRemoteAnnotations).mock.calls.at(-1);
    expect(lastEmit?.[0].map((item) => item.id)).toEqual(["local-1"]);
    expect(harness.dependencies.onError).not.toHaveBeenCalled();
  });
});

describe("createRuntimeSync server events", () => {
  async function connected(harness: Harness) {
    harness.sessions.set("/page", "sess_events");
    harness.route("/sessions/sess_events", () =>
      jsonResponse({ id: "sess_events", annotations: [] }),
    );
    harness.route("/health", () => jsonResponse({ ok: true }));
    const sync = createRuntimeSync(harness.dependencies);
    await sync.configure({ endpoint: ENDPOINT }, "/page", []);
    await harness.settle();
    return sync;
  }

  it("removes records the server resolved or dismissed and ignores everything else", async () => {
    const harness = createHarness();
    const sync = await connected(harness);
    const source = harness.events()[0];
    expect(source.url).toBe(`${ENDPOINT}/sessions/sess_events/events`);

    source.emit("annotation.updated", JSON.stringify({ payload: { id: "a", status: "resolved" } }));
    source.emit(
      "annotation.updated",
      JSON.stringify({ payload: { id: "b", status: "dismissed", kind: "placement" } }),
    );
    source.emit(
      "annotation.updated",
      JSON.stringify({ payload: { id: "c", status: "acknowledged" } }),
    );
    source.emit("annotation.updated", "not json");
    source.emit("annotation.updated", JSON.stringify({ payload: { status: "resolved" } }));

    expect(vi.mocked(harness.dependencies.onRemoteRemoved).mock.calls).toEqual([
      ["a", "feedback"],
      ["b", "placement"],
    ]);

    sync.destroy();
    expect(source.closed).toBe(true);
    source.emit("annotation.updated", JSON.stringify({ payload: { id: "d", status: "resolved" } }));
    expect(harness.dependencies.onRemoteRemoved).toHaveBeenCalledTimes(2);
  });
});

describe("createRuntimeSync mutations", () => {
  async function connected(harness: Harness) {
    harness.sessions.set("/page", "sess_crud");
    harness.route("/sessions/sess_crud", () => jsonResponse({ id: "sess_crud", annotations: [] }));
    harness.route("/health", () => jsonResponse({ ok: true }));
    const sync = createRuntimeSync(harness.dependencies);
    await sync.configure({ endpoint: ENDPOINT }, "/page", []);
    await harness.settle();
    return sync;
  }

  it("does nothing without an endpoint and session", async () => {
    const harness = createHarness();
    const sync = createRuntimeSync(harness.dependencies);
    await sync.configure({}, "/page", []);

    await sync.add(annotation("a"));
    await sync.update(annotation("a"));
    await sync.delete("a");
    await sync.clear(["a"]);
    expect(await sync.action("output")).toBe(false);

    expect(harness.requests).toHaveLength(0);
    expect(harness.dependencies.onError).not.toHaveBeenCalled();
  });

  it("adopts a server-assigned id by retiring the local record first", async () => {
    const harness = createHarness();
    harness.route("/sessions/sess_crud/annotations", () => jsonResponse(annotation("server-id")));
    const sync = await connected(harness);

    const order: string[] = [];
    vi.mocked(harness.dependencies.onRemoteRemoved).mockImplementation(() => order.push("removed"));
    vi.mocked(harness.dependencies.onRemoteAnnotations).mockImplementation(() =>
      order.push("merged"),
    );

    await sync.add(annotation("local-id"));

    expect(order).toEqual(["removed", "merged"]);
    expect(harness.dependencies.onRemoteRemoved).toHaveBeenCalledWith("local-id", "feedback");
    expect(
      vi.mocked(harness.dependencies.onRemoteAnnotations).mock.calls.at(-1)?.[0][0].id,
    ).toBe("server-id");
  });

  it("stays quiet when the server keeps the local id", async () => {
    const harness = createHarness();
    harness.route("/sessions/sess_crud/annotations", (_url, init) =>
      jsonResponse(JSON.parse(String(init?.body))),
    );
    const sync = await connected(harness);
    vi.mocked(harness.dependencies.onRemoteAnnotations).mockClear();

    await sync.add(annotation("keep-id"));

    expect(harness.dependencies.onRemoteRemoved).not.toHaveBeenCalled();
    expect(harness.dependencies.onRemoteAnnotations).not.toHaveBeenCalled();
  });

  it("surfaces every mutation failure as a recoverable report", async () => {
    const harness = createHarness();
    harness.route("/annotations", () => Promise.reject(new Error("offline")));
    harness.route("/action", () => Promise.reject(new Error("offline")));
    const sync = await connected(harness);

    await sync.add(annotation("a"));
    await sync.update(annotation("a", { comment: "next" }));
    await sync.delete("a");
    await sync.clear(["b", "c"]);
    expect(await sync.action("output")).toBe(false);

    const messages = vi.mocked(harness.dependencies.onError).mock.calls.map((call) => call[0]);
    expect(messages).toEqual([
      "Failed to sync annotation; it remains stored locally",
      "Failed to update annotation on server",
      "Failed to delete annotation from server",
      "Failed to delete annotation from server",
      "Failed to delete annotation from server",
      "Failed to send annotations to the agent",
    ]);
  });

  it("reports a delivered action", async () => {
    const harness = createHarness();
    harness.route("/action", () =>
      jsonResponse({ success: true, annotationCount: 1, delivered: { sseListeners: 1, webhooks: 0, total: 1 } }),
    );
    const sync = await connected(harness);

    expect(await sync.action("# Feedback")).toBe(true);
    const request = harness.requests.find((entry) => entry.url.endsWith("/action"));
    expect(request?.body).toEqual({ output: "# Feedback" });
  });
});

describe("utils/sync abort threading", () => {
  it("passes the signal into every request init", async () => {
    const harness = createHarness();
    harness.route("/", () => jsonResponse({ id: "sess" }));
    const controller = new AbortController();
    const { signal } = controller;

    await createSession(ENDPOINT, "http://localhost/page", signal);
    await getSession(ENDPOINT, "sess", signal);
    await syncAnnotation(ENDPOINT, "sess", annotation("a"), signal);
    await updateAnnotation(ENDPOINT, "a", { comment: "x" }, signal);
    await deleteAnnotation(ENDPOINT, "a", signal);
    await requestAction(ENDPOINT, "sess", "output", signal);

    controller.abort();
    expect(harness.requests).toHaveLength(6);
    expect(harness.requests.every((request) => request.aborted())).toBe(true);
  });
});

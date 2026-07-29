// =============================================================================
// Runtime Storage
// =============================================================================
//
// Every persistence read/write the native runtime performs, routed through the
// owning realm's `localStorage`/`sessionStorage` (see `environment.ts`). Two
// Agentation instances in two iframes each persist through their own realm.
//
// Key literals are imported from `../utils/storage` so the native runtime and
// the legacy React tree can never drift onto different keys.
//
// Every method is total: malformed JSON, wrong shapes, unavailable storage,
// quota errors and `SecurityError` all yield the in-memory default and report
// one `StorageFailure` for the failed operation. A read that simply finds
// nothing is not a failure.
// =============================================================================

import type { Annotation, OutputDetailLevel } from "../types";
import {
  DEFAULT_RETENTION_DAYS,
  DESIGN_PREFIX,
  REARRANGE_PREFIX,
  SESSION_PREFIX,
  STORAGE_PREFIX,
  TOOLBAR_HIDDEN_SESSION_KEY,
  WIREFRAME_PREFIX,
} from "../utils/storage";
import type { RuntimeEnvironment, StorageLike } from "./environment";
import type { DesignPlacement, RearrangeState } from "./layout/types";
import {
  ACCENT_OPTIONS,
  DEFAULT_SETTINGS,
  type AccentId,
  type MarkerClickBehavior,
  type ToolbarSettings,
} from "./view/model";

// -----------------------------------------------------------------------------
// Keys owned by the toolbar shell
// -----------------------------------------------------------------------------

export const SETTINGS_KEY = "feedback-toolbar-settings";
export const THEME_KEY = "feedback-toolbar-theme";
export const TOOLBAR_POSITION_KEY = "feedback-toolbar-position";

// -----------------------------------------------------------------------------
// Public shapes
// -----------------------------------------------------------------------------

export type StorageFailure = {
  key: string;
  operation: "read" | "write" | "remove";
  cause: unknown;
};

/** Per-pathname wireframe stash: layout state kept apart from explore mode. */
export type WireframeSnapshot = {
  rearrange: RearrangeState | null;
  placements: DesignPlacement[];
  purpose: string;
};

export type ToolbarPosition = { x: number; y: number };

export type RuntimeStorage = {
  // Annotations
  loadAnnotations(pathname: string): Annotation[];
  saveAnnotations(
    pathname: string,
    annotations: readonly Annotation[],
    sessionId?: string,
  ): void;
  clearAnnotations(pathname: string): void;
  loadAllAnnotations(): Map<string, Annotation[]>;
  getUnsyncedAnnotations(pathname: string, sessionId?: string): Annotation[];

  // Layout mode
  loadPlacements(pathname: string): DesignPlacement[];
  savePlacements(pathname: string, placements: readonly DesignPlacement[]): void;
  clearPlacements(pathname: string): void;
  loadRearrange(pathname: string): RearrangeState | null;
  saveRearrange(pathname: string, state: RearrangeState): void;
  clearRearrange(pathname: string): void;
  loadWireframe(pathname: string): WireframeSnapshot | null;
  saveWireframe(pathname: string, state: WireframeSnapshot): void;
  clearWireframe(pathname: string): void;

  // Sessions
  loadSessionId(pathname: string): string | null;
  saveSessionId(pathname: string, sessionId: string): void;
  clearSessionId(pathname: string): void;

  // Shell
  loadToolbarHidden(): boolean;
  saveToolbarHidden(hidden: boolean): void;
  loadSettings(): ToolbarSettings;
  saveSettings(settings: ToolbarSettings): void;
  loadTheme(): "dark" | "light";
  saveTheme(theme: "dark" | "light"): void;
  loadToolbarPosition(): ToolbarPosition | null;
  saveToolbarPosition(position: ToolbarPosition): void;
  clearToolbarPosition(): void;
};

// -----------------------------------------------------------------------------
// Internals
// -----------------------------------------------------------------------------

/** Annotations carry an internal sync marker; see `utils/storage`. */
type StoredAnnotation = Annotation & { _syncedTo?: string };

/**
 * The persisted settings blob. Every field is unvalidated — including
 * `reactEnabled`, the pre-4.0 name of `metadataEnabled`.
 */
type StoredSettings = { [K in keyof ToolbarSettings]?: unknown } & {
  reactEnabled?: unknown;
};

const STORAGE_UNAVAILABLE = new Error("Storage is unavailable in this realm");

const OUTPUT_DETAIL_LEVELS: Record<string, true> = {
  compact: true,
  standard: true,
  detailed: true,
  forensic: true,
};

const MARKER_CLICK_BEHAVIORS: Record<string, true> = { edit: true, delete: true };

function malformed(key: string, value: unknown): TypeError {
  return new TypeError(
    `Agentation ignored a malformed value for "${key}" (${
      Array.isArray(value) ? "array" : value === null ? "null" : typeof value
    })`,
  );
}

export function createRuntimeStorage(
  environment: RuntimeEnvironment,
  onFailure: (failure: StorageFailure) => void,
): RuntimeStorage {
  // Holds only keys whose last mutation could not reach the real storage, so it
  // is authoritative for those keys: the runtime keeps round-tripping values
  // within the session even when storage is blocked. `null` is a tombstone for
  // a removal that failed to persist.
  const memory = new Map<string, string | null>();

  const fail = (
    key: string,
    operation: StorageFailure["operation"],
    cause: unknown = STORAGE_UNAVAILABLE,
  ): void => {
    onFailure({ key, operation, cause });
  };

  const readText = (storage: StorageLike | undefined, key: string): string | null => {
    const pending = memory.get(key);
    if (pending !== undefined) return pending;
    if (!storage) {
      fail(key, "read");
      return null;
    }
    try {
      return storage.getItem(key);
    } catch (cause) {
      fail(key, "read", cause);
      return null;
    }
  };

  const writeText = (
    storage: StorageLike | undefined,
    key: string,
    value: string,
  ): void => {
    if (storage) {
      try {
        storage.setItem(key, value);
        memory.delete(key);
        return;
      } catch (cause) {
        memory.set(key, value);
        fail(key, "write", cause);
        return;
      }
    }
    memory.set(key, value);
    fail(key, "write");
  };

  const removeText = (storage: StorageLike | undefined, key: string): void => {
    if (storage) {
      try {
        storage.removeItem(key);
        memory.delete(key);
        return;
      } catch (cause) {
        memory.set(key, null);
        fail(key, "remove", cause);
        return;
      }
    }
    memory.set(key, null);
    fail(key, "remove");
  };

  /** Parses stored JSON. `undefined` covers both "nothing stored" and failure. */
  const readJson = (storage: StorageLike | undefined, key: string): unknown => {
    const text = readText(storage, key);
    if (text === null || text === "") return undefined;
    try {
      return JSON.parse(text);
    } catch (cause) {
      fail(key, "read", cause);
      return undefined;
    }
  };

  const writeJson = (
    storage: StorageLike | undefined,
    key: string,
    value: unknown,
  ): void => {
    let text: string;
    try {
      text = JSON.stringify(value);
    } catch (cause) {
      fail(key, "write", cause);
      return;
    }
    writeText(storage, key, text);
  };

  const retentionCutoff = (): number =>
    environment.now() - DEFAULT_RETENTION_DAYS * 24 * 60 * 60 * 1000;

  /** Applies the seven-day retention filter; reports a wrong shape once. */
  const retained = (key: string, parsed: unknown, cutoff: number): StoredAnnotation[] => {
    if (parsed === undefined) return [];
    if (!Array.isArray(parsed)) {
      fail(key, "read", malformed(key, parsed));
      return [];
    }
    const kept: StoredAnnotation[] = [];
    for (const entry of parsed as StoredAnnotation[]) {
      if (!entry) continue;
      if (!entry.timestamp || entry.timestamp > cutoff) kept.push(entry);
    }
    return kept;
  };

  const loadStored = (pathname: string): StoredAnnotation[] => {
    const key = `${STORAGE_PREFIX}${pathname}`;
    return retained(key, readJson(environment.localStorage, key), retentionCutoff());
  };

  const normalizeSettings = (parsed: unknown): ToolbarSettings => {
    if (parsed === undefined || parsed === null) return { ...DEFAULT_SETTINGS };
    if (typeof parsed !== "object") {
      fail(SETTINGS_KEY, "read", malformed(SETTINGS_KEY, parsed));
      return { ...DEFAULT_SETTINGS };
    }

    const stored = parsed as StoredSettings;
    const { annotationColorId, markerClickBehavior, metadataEnabled, outputDetail } =
      stored;
    // Pre-4.0 builds persisted the metadata switch as `reactEnabled`. It is read
    // here and never written back.
    const legacyMetadata = stored.reactEnabled;

    return {
      outputDetail:
        typeof outputDetail === "string" && OUTPUT_DETAIL_LEVELS[outputDetail]
          ? (outputDetail as OutputDetailLevel)
          : DEFAULT_SETTINGS.outputDetail,
      autoClearAfterCopy:
        typeof stored.autoClearAfterCopy === "boolean"
          ? stored.autoClearAfterCopy
          : DEFAULT_SETTINGS.autoClearAfterCopy,
      annotationColorId:
        typeof annotationColorId === "string" &&
        ACCENT_OPTIONS.some((accent) => accent.id === annotationColorId)
          ? (annotationColorId as AccentId)
          : DEFAULT_SETTINGS.annotationColorId,
      blockInteractions:
        typeof stored.blockInteractions === "boolean"
          ? stored.blockInteractions
          : DEFAULT_SETTINGS.blockInteractions,
      metadataEnabled:
        typeof metadataEnabled === "boolean"
          ? metadataEnabled
          : typeof legacyMetadata === "boolean"
            ? legacyMetadata
            : DEFAULT_SETTINGS.metadataEnabled,
      markerClickBehavior:
        typeof markerClickBehavior === "string" &&
        MARKER_CLICK_BEHAVIORS[markerClickBehavior]
          ? (markerClickBehavior as MarkerClickBehavior)
          : DEFAULT_SETTINGS.markerClickBehavior,
      webhookUrl:
        typeof stored.webhookUrl === "string"
          ? stored.webhookUrl
          : DEFAULT_SETTINGS.webhookUrl,
      webhooksEnabled:
        typeof stored.webhooksEnabled === "boolean"
          ? stored.webhooksEnabled
          : DEFAULT_SETTINGS.webhooksEnabled,
    };
  };

  return {
    // --- Annotations --------------------------------------------------------
    loadAnnotations(pathname) {
      return loadStored(pathname);
    },

    saveAnnotations(pathname, annotations, sessionId) {
      const payload = sessionId
        ? annotations.map((annotation) => ({ ...annotation, _syncedTo: sessionId }))
        : annotations;
      writeJson(environment.localStorage, `${STORAGE_PREFIX}${pathname}`, payload);
    },

    clearAnnotations(pathname) {
      removeText(environment.localStorage, `${STORAGE_PREFIX}${pathname}`);
    },

    loadAllAnnotations() {
      const result = new Map<string, Annotation[]>();
      const cutoff = retentionCutoff();
      const local = environment.localStorage;

      // Unpersisted writes win: they are newer than whatever storage still holds.
      const overridden = new Set<string>();
      for (const [key, text] of memory) {
        if (!key.startsWith(STORAGE_PREFIX)) continue;
        const pathname = key.slice(STORAGE_PREFIX.length);
        overridden.add(pathname);
        if (text === null) continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch (cause) {
          fail(key, "read", cause);
          continue;
        }
        const kept = retained(key, parsed, cutoff);
        if (kept.length > 0) result.set(pathname, kept);
      }

      if (!local) {
        // The prefix stands in for the key space that could not be enumerated.
        if (overridden.size === 0) fail(STORAGE_PREFIX, "read");
        return result;
      }

      try {
        for (let index = 0; index < local.length; index++) {
          const key = local.key(index);
          if (!key?.startsWith(STORAGE_PREFIX)) continue;
          const pathname = key.slice(STORAGE_PREFIX.length);
          if (overridden.has(pathname)) continue;
          const text = local.getItem(key);
          if (!text) continue;
          let parsed: unknown;
          try {
            parsed = JSON.parse(text);
          } catch (cause) {
            fail(key, "read", cause);
            continue;
          }
          const kept = retained(key, parsed, cutoff);
          if (kept.length > 0) result.set(pathname, kept);
        }
      } catch (cause) {
        fail(STORAGE_PREFIX, "read", cause);
      }

      return result;
    },

    getUnsyncedAnnotations(pathname, sessionId) {
      return loadStored(pathname).filter((annotation) => {
        if (!annotation._syncedTo) return true;
        if (sessionId && annotation._syncedTo !== sessionId) return true;
        return false;
      });
    },

    // --- Layout mode --------------------------------------------------------
    loadPlacements(pathname) {
      const key = `${DESIGN_PREFIX}${pathname}`;
      const parsed = readJson(environment.localStorage, key);
      if (parsed === undefined) return [];
      if (!Array.isArray(parsed)) {
        fail(key, "read", malformed(key, parsed));
        return [];
      }
      return parsed as DesignPlacement[];
    },

    savePlacements(pathname, placements) {
      writeJson(environment.localStorage, `${DESIGN_PREFIX}${pathname}`, placements);
    },

    clearPlacements(pathname) {
      removeText(environment.localStorage, `${DESIGN_PREFIX}${pathname}`);
    },

    loadRearrange(pathname) {
      const key = `${REARRANGE_PREFIX}${pathname}`;
      const parsed = readJson(environment.localStorage, key);
      if (parsed === undefined || parsed === null) return null;
      const state = parsed as RearrangeState;
      if (!Array.isArray(state.sections)) {
        fail(key, "read", malformed(key, parsed));
        return null;
      }
      return state;
    },

    saveRearrange(pathname, state) {
      writeJson(environment.localStorage, `${REARRANGE_PREFIX}${pathname}`, state);
    },

    clearRearrange(pathname) {
      removeText(environment.localStorage, `${REARRANGE_PREFIX}${pathname}`);
    },

    loadWireframe(pathname) {
      const key = `${WIREFRAME_PREFIX}${pathname}`;
      const parsed = readJson(environment.localStorage, key);
      if (parsed === undefined || parsed === null) return null;
      const stash = parsed as WireframeSnapshot;
      if (!Array.isArray(stash.placements) || typeof stash.purpose !== "string") {
        fail(key, "read", malformed(key, parsed));
        return null;
      }
      return {
        rearrange: Array.isArray(stash.rearrange?.sections) ? stash.rearrange : null,
        placements: stash.placements,
        purpose: stash.purpose,
      };
    },

    saveWireframe(pathname, state) {
      writeJson(environment.localStorage, `${WIREFRAME_PREFIX}${pathname}`, state);
    },

    clearWireframe(pathname) {
      removeText(environment.localStorage, `${WIREFRAME_PREFIX}${pathname}`);
    },

    // --- Sessions -----------------------------------------------------------
    loadSessionId(pathname) {
      const stored = readText(environment.localStorage, `${SESSION_PREFIX}${pathname}`);
      return stored ? stored : null;
    },

    saveSessionId(pathname, sessionId) {
      writeText(environment.localStorage, `${SESSION_PREFIX}${pathname}`, sessionId);
    },

    clearSessionId(pathname) {
      removeText(environment.localStorage, `${SESSION_PREFIX}${pathname}`);
    },

    // --- Shell --------------------------------------------------------------
    loadToolbarHidden() {
      return readText(environment.sessionStorage, TOOLBAR_HIDDEN_SESSION_KEY) === "1";
    },

    saveToolbarHidden(hidden) {
      if (hidden) writeText(environment.sessionStorage, TOOLBAR_HIDDEN_SESSION_KEY, "1");
      else removeText(environment.sessionStorage, TOOLBAR_HIDDEN_SESSION_KEY);
    },

    loadSettings() {
      const settings = normalizeSettings(readJson(environment.localStorage, SETTINGS_KEY));
      // Write the normalised shape straight back so the migration off
      // `reactEnabled` survives the next load even if nothing else changes.
      writeJson(environment.localStorage, SETTINGS_KEY, settings);
      return settings;
    },

    saveSettings(settings) {
      writeJson(environment.localStorage, SETTINGS_KEY, settings);
    },

    loadTheme() {
      const stored = readText(environment.localStorage, THEME_KEY);
      if (stored === "dark" || stored === "light") return stored;
      if (stored !== null && stored !== "") {
        fail(THEME_KEY, "read", malformed(THEME_KEY, stored));
      }
      return "dark";
    },

    saveTheme(theme) {
      writeText(environment.localStorage, THEME_KEY, theme);
    },

    loadToolbarPosition() {
      const parsed = readJson(environment.localStorage, TOOLBAR_POSITION_KEY);
      if (parsed === undefined || parsed === null) return null;
      const position = parsed as ToolbarPosition;
      if (typeof position.x !== "number" || typeof position.y !== "number") {
        fail(TOOLBAR_POSITION_KEY, "read", malformed(TOOLBAR_POSITION_KEY, parsed));
        return null;
      }
      return { x: position.x, y: position.y };
    },

    saveToolbarPosition(position) {
      writeJson(environment.localStorage, TOOLBAR_POSITION_KEY, position);
    },

    clearToolbarPosition() {
      removeText(environment.localStorage, TOOLBAR_POSITION_KEY);
    },
  };
}

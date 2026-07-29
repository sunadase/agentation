import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "./view/model";
import {
  createRuntimeEnvironment,
  type RuntimeEnvironment,
  type StorageLike,
} from "./environment";
import {
  createRuntimeStorage,
  SETTINGS_KEY,
  THEME_KEY,
  TOOLBAR_POSITION_KEY,
  type RuntimeStorage,
  type StorageFailure,
} from "./storage";
import type { Annotation } from "../types";

const DAY = 24 * 60 * 60 * 1000;

function annotation(id: string, timestamp?: number): Annotation {
  return {
    id,
    x: 10,
    y: 20,
    comment: `comment ${id}`,
    element: "button",
    ...(timestamp === undefined ? {} : { timestamp }),
  } as Annotation;
}

/** Realm storage that fails every operation, as in Safari private mode. */
function blockedStorage(): StorageLike {
  const blocked = () => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  };
  return {
    getItem: blocked,
    setItem: blocked,
    removeItem: blocked,
    key: blocked,
    get length(): number {
      return blocked();
    },
  };
}

function withStorage(
  localStorage: StorageLike | undefined,
  sessionStorage?: StorageLike,
): { storage: RuntimeStorage; failures: StorageFailure[] } {
  const failures: StorageFailure[] = [];
  const environment = {
    localStorage,
    sessionStorage,
    now: () => Date.now(),
  } as unknown as RuntimeEnvironment;
  return {
    storage: createRuntimeStorage(environment, (failure) => failures.push(failure)),
    failures,
  };
}

let storage: RuntimeStorage;
let failures: StorageFailure[];

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  failures = [];
  storage = createRuntimeStorage(createRuntimeEnvironment(document), (failure) =>
    failures.push(failure),
  );
});

describe("runtime storage settings migration", () => {
  it("adopts legacy reactEnabled, defaults an unknown accent, and rewrites the key", () => {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ reactEnabled: false, annotationColorId: "purple" }),
    );

    const settings = storage.loadSettings();

    expect(settings.metadataEnabled).toBe(false);
    expect(settings.annotationColorId).toBe("blue");
    const rewritten = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null");
    expect("reactEnabled" in rewritten).toBe(false);
    expect(rewritten.metadataEnabled).toBe(false);
    expect(failures).toEqual([]);
  });

  it("prefers metadataEnabled over the legacy key and drops invalid enum values", () => {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        metadataEnabled: true,
        reactEnabled: false,
        outputDetail: "verbose",
        markerClickBehavior: "drag",
        blockInteractions: "yes",
        webhookUrl: 42,
        webhooksEnabled: false,
      }),
    );

    expect(storage.loadSettings()).toEqual({
      ...DEFAULT_SETTINGS,
      metadataEnabled: true,
      webhooksEnabled: false,
    });
  });

  it("reports malformed JSON once and falls back to defaults", () => {
    localStorage.setItem(SETTINGS_KEY, "{not json");

    expect(storage.loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ key: SETTINGS_KEY, operation: "read" });
  });

  it("round-trips every persisted field", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      outputDetail: "forensic" as const,
      autoClearAfterCopy: true,
      annotationColorId: "orange" as const,
      blockInteractions: false,
      metadataEnabled: false,
      markerClickBehavior: "delete" as const,
      webhookUrl: "https://example.test/hook",
      webhooksEnabled: false,
    };
    storage.saveSettings(settings);
    expect(storage.loadSettings()).toEqual(settings);
  });
});

describe("runtime storage annotations", () => {
  it("drops entries past the seven-day retention window and keeps undated ones", () => {
    const fresh = annotation("fresh", Date.now() - DAY);
    localStorage.setItem(
      "feedback-annotations-/docs",
      JSON.stringify([annotation("stale", Date.now() - 8 * DAY), fresh, annotation("undated")]),
    );

    expect(storage.loadAnnotations("/docs").map((entry) => entry.id)).toEqual([
      "fresh",
      "undated",
    ]);
    expect(failures).toEqual([]);
  });

  it("stamps a sync marker and reports only unsynced entries", () => {
    storage.saveAnnotations("/docs", [annotation("a"), annotation("b")], "session-1");

    expect(storage.getUnsyncedAnnotations("/docs", "session-1")).toEqual([]);
    expect(storage.getUnsyncedAnnotations("/docs", "session-2").map((e) => e.id)).toEqual([
      "a",
      "b",
    ]);

    storage.saveAnnotations("/docs", [annotation("c")]);
    expect(storage.getUnsyncedAnnotations("/docs").map((e) => e.id)).toEqual(["c"]);
  });

  it("collects every retained pathname and skips empty ones", () => {
    storage.saveAnnotations("/a", [annotation("a1")]);
    storage.saveAnnotations("/b", []);
    localStorage.setItem(
      "feedback-annotations-/c",
      JSON.stringify([annotation("c1", Date.now() - 30 * DAY)]),
    );
    localStorage.setItem("unrelated-key", "ignored");

    const all = storage.loadAllAnnotations();
    expect([...all.keys()]).toEqual(["/a"]);
    expect(all.get("/a")?.[0]?.id).toBe("a1");
  });

  it("reports a wrong shape once and returns an empty list", () => {
    localStorage.setItem("feedback-annotations-/docs", JSON.stringify({ id: "nope" }));

    expect(storage.loadAnnotations("/docs")).toEqual([]);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.operation).toBe("read");
  });

  it("finds nothing without reporting a failure", () => {
    expect(storage.loadAnnotations("/missing")).toEqual([]);
    expect(storage.loadSessionId("/missing")).toBeNull();
    expect(storage.loadRearrange("/missing")).toBeNull();
    expect(storage.loadWireframe("/missing")).toBeNull();
    expect(storage.loadPlacements("/missing")).toEqual([]);
    expect(storage.loadToolbarPosition()).toBeNull();
    expect(failures).toEqual([]);
  });
});

describe("runtime storage shell state", () => {
  it("round-trips theme, position and per-tab visibility", () => {
    expect(storage.loadTheme()).toBe("dark");
    storage.saveTheme("light");
    expect(localStorage.getItem(THEME_KEY)).toBe("light");
    expect(storage.loadTheme()).toBe("light");

    storage.saveToolbarPosition({ x: 12, y: 34 });
    expect(localStorage.getItem(TOOLBAR_POSITION_KEY)).toBe('{"x":12,"y":34}');
    expect(storage.loadToolbarPosition()).toEqual({ x: 12, y: 34 });
    storage.clearToolbarPosition();
    expect(storage.loadToolbarPosition()).toBeNull();

    expect(storage.loadToolbarHidden()).toBe(false);
    storage.saveToolbarHidden(true);
    expect(sessionStorage.getItem("agentation-session-toolbar-hidden")).toBe("1");
    expect(storage.loadToolbarHidden()).toBe(true);
    storage.saveToolbarHidden(false);
    expect(storage.loadToolbarHidden()).toBe(false);
    expect(failures).toEqual([]);
  });

  it("rejects a partial stored position", () => {
    localStorage.setItem(TOOLBAR_POSITION_KEY, JSON.stringify({ x: 5 }));

    expect(storage.loadToolbarPosition()).toBeNull();
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ key: TOOLBAR_POSITION_KEY, operation: "read" });
  });
});

describe("runtime storage degradation", () => {
  it("round-trips in memory when the realm exposes no storage", () => {
    const { storage: memoryOnly, failures: reported } = withStorage(undefined, undefined);

    memoryOnly.saveAnnotations("/docs", [annotation("a")]);
    expect(reported).toEqual([
      { key: "feedback-annotations-/docs", operation: "write", cause: expect.any(Error) },
    ]);

    expect(memoryOnly.loadAnnotations("/docs").map((entry) => entry.id)).toEqual(["a"]);
    expect([...memoryOnly.loadAllAnnotations().keys()]).toEqual(["/docs"]);
    expect(reported).toHaveLength(1);

    memoryOnly.saveToolbarHidden(true);
    expect(memoryOnly.loadToolbarHidden()).toBe(true);
    memoryOnly.clearAnnotations("/docs");
    expect(memoryOnly.loadAnnotations("/docs")).toEqual([]);
  });

  it("reports a read failure once per unreachable key", () => {
    const { storage: memoryOnly, failures: reported } = withStorage(undefined, undefined);

    expect(memoryOnly.loadTheme()).toBe("dark");
    expect(reported).toEqual([
      { key: THEME_KEY, operation: "read", cause: expect.any(Error) },
    ]);
  });

  it("survives a storage that throws on every operation", () => {
    const { storage: hostile, failures: reported } = withStorage(
      blockedStorage(),
      blockedStorage(),
    );

    expect(hostile.loadSettings()).toEqual(DEFAULT_SETTINGS);
    // One failed read plus one failed migration write-back.
    expect(reported.map((failure) => failure.operation)).toEqual(["read", "write"]);
    expect(reported.every((failure) => failure.cause instanceof DOMException)).toBe(true);

    // The failed write is retained in memory, so the session still round-trips.
    expect(hostile.loadSettings().metadataEnabled).toBe(true);
    expect(hostile.loadAllAnnotations().size).toBe(0);
    expect(hostile.loadToolbarHidden()).toBe(false);
  });

  it("reports a quota failure and keeps serving the value it could not persist", () => {
    const setItem = vi.fn(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });
    const { storage: full, failures: reported } = withStorage({
      getItem: () => null,
      setItem,
      removeItem: () => undefined,
      key: () => null,
      length: 0,
    });

    full.saveAnnotations("/docs", [annotation("a")]);
    expect(setItem).toHaveBeenCalledOnce();
    expect(reported).toHaveLength(1);
    expect(reported[0]).toMatchObject({
      key: "feedback-annotations-/docs",
      operation: "write",
    });

    // Storage still reports the key as absent, but the session keeps the value.
    expect(full.loadAnnotations("/docs").map((entry) => entry.id)).toEqual(["a"]);
    expect(reported).toHaveLength(1);
  });
});

describe("runtime storage layout state", () => {
  it("round-trips placements, rearrangement and the wireframe stash", () => {
    const placement = { id: "p1", type: "card", x: 1, y: 2, width: 100, height: 80 };
    storage.savePlacements("/docs", [placement] as never);
    expect(storage.loadPlacements("/docs")).toEqual([placement]);
    storage.clearPlacements("/docs");
    expect(storage.loadPlacements("/docs")).toEqual([]);

    const rearrange = { sections: [], originalOrder: [], detectedAt: 5 };
    storage.saveRearrange("/docs", rearrange as never);
    expect(storage.loadRearrange("/docs")).toEqual(rearrange);
    storage.clearRearrange("/docs");
    expect(storage.loadRearrange("/docs")).toBeNull();

    const wireframe = { rearrange: null, placements: [], purpose: "checkout" };
    storage.saveWireframe("/docs", wireframe as never);
    expect(storage.loadWireframe("/docs")).toEqual(wireframe);
    storage.clearWireframe("/docs");
    expect(storage.loadWireframe("/docs")).toBeNull();
    expect(failures).toEqual([]);
  });

  it("reports a wireframe stash with the wrong shape", () => {
    localStorage.setItem("agentation-wireframe-/docs", JSON.stringify({ purpose: 7 }));

    expect(storage.loadWireframe("/docs")).toBeNull();
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      key: "agentation-wireframe-/docs",
      operation: "read",
    });
  });
});

describe("runtime storage sessions", () => {
  it("round-trips a session id per pathname", () => {
    storage.saveSessionId("/docs", "session-1");
    expect(localStorage.getItem("agentation-session-/docs")).toBe("session-1");
    expect(storage.loadSessionId("/docs")).toBe("session-1");
    expect(storage.loadSessionId("/other")).toBeNull();
    storage.clearSessionId("/docs");
    expect(storage.loadSessionId("/docs")).toBeNull();
    expect(failures).toEqual([]);
  });
});

// =============================================================================
// Freeze Animations
// =============================================================================
//
// Pauses CSS animations/transitions, WAAPI animations and videos, and wraps the
// owning window's timer functions so page callbacks are queued (setTimeout,
// requestAnimationFrame) or skipped (setInterval) while frozen.
//
// Importing this module mutates nothing. Wrappers are installed when the first
// controller for a window is created and removed when the last one is
// destroyed, so `import "agentation"` never patches globals and SSR is safe.
// =============================================================================

export type UnfrozenScheduler = Pick<
  Window,
  | "setTimeout"
  | "clearTimeout"
  | "setInterval"
  | "clearInterval"
  | "requestAnimationFrame"
  | "cancelAnimationFrame"
>;

export interface AnimationFreezeController {
  readonly frozen: boolean;
  freeze(): void;
  unfreeze(): void;
  destroy(): void;
  /** Timer functions that keep running while the page is frozen. */
  readonly scheduler: UnfrozenScheduler;
}

// Agentation's own UI must never be frozen. The legacy React attributes are
// retained so a retained React popup keeps animating; the native runtime marks
// every node it owns with `data-agentation-ui` inside `<agentation-overlay>`.
const EXCLUDE_ATTRS = [
  "data-feedback-toolbar",
  "data-annotation-popup",
  "data-annotation-marker",
  "data-agentation-ui",
];
const NOT_SELECTORS = [
  ...EXCLUDE_ATTRS.flatMap((attribute) => [`:not([${attribute}])`, `:not([${attribute}] *)`]),
  ":not(agentation-overlay)",
  ":not(agentation-overlay *)",
].join("");

const STYLE_ID = "feedback-freeze-styles";
const STATE_KEY = "__agentationFreezeState";

type WindowFreezeState = {
  /** Live controllers for this window. Wrappers are installed while > 0. */
  controllers: number;
  /** Controllers currently requesting a freeze. */
  freezeDepth: number;
  installed: boolean;
  original: UnfrozenScheduler;
  /**
   * Property descriptors as found before patching, so uninstalling leaves the
   * window byte-identical. Restoring by plain assignment would leave behind an
   * own property shadowing an inherited one, which breaks any other library
   * that patches the same timers by descriptor.
   */
  descriptors: Map<string, PropertyDescriptor | undefined>;
  timeoutQueue: Array<() => void>;
  rafQueue: FrameRequestCallback[];
  pausedAnimations: Animation[];
};

type FreezeWindow = Window & { [STATE_KEY]?: WindowFreezeState };

function nativeScheduler(view: Window): UnfrozenScheduler {
  return {
    setTimeout: view.setTimeout.bind(view) as Window["setTimeout"],
    clearTimeout: view.clearTimeout.bind(view),
    setInterval: view.setInterval.bind(view) as Window["setInterval"],
    clearInterval: view.clearInterval.bind(view),
    requestAnimationFrame: view.requestAnimationFrame?.bind(view) as Window["requestAnimationFrame"],
    cancelAnimationFrame: view.cancelAnimationFrame?.bind(view) as Window["cancelAnimationFrame"],
  };
}

function readState(view: FreezeWindow): WindowFreezeState {
  let state = view[STATE_KEY];
  if (!state) {
    state = {
      controllers: 0,
      freezeDepth: 0,
      installed: false,
      original: nativeScheduler(view),
      descriptors: new Map(),
      timeoutQueue: [],
      rafQueue: [],
      pausedAnimations: [],
    };
    view[STATE_KEY] = state;
  }
  return state;
}

function install(view: FreezeWindow, state: WindowFreezeState): void {
  if (state.installed) return;
  const patched = view as unknown as Record<string, unknown>;

  const patch = (name: string, value: unknown): void => {
    state.descriptors.set(name, Object.getOwnPropertyDescriptor(view, name));
    patched[name] = value;
  };

  patch("setTimeout", (handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
    if (typeof handler === "string") return state.original.setTimeout(handler, timeout);
    return state.original.setTimeout(
      (...called: unknown[]) => {
        if (state.freezeDepth > 0) {
          state.timeoutQueue.push(() => (handler as (...a: unknown[]) => void)(...called));
          return;
        }
        (handler as (...a: unknown[]) => void)(...called);
      },
      timeout,
      ...args,
    );
  });

  patch("setInterval", (handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
    if (typeof handler === "string") return state.original.setInterval(handler, timeout);
    return state.original.setInterval(
      (...called: unknown[]) => {
        if (state.freezeDepth > 0) return;
        (handler as (...a: unknown[]) => void)(...called);
      },
      timeout,
      ...args,
    );
  });

  if (typeof state.original.requestAnimationFrame === "function") {
    patch("requestAnimationFrame", (callback: FrameRequestCallback) =>
      state.original.requestAnimationFrame((timestamp) => {
        if (state.freezeDepth > 0) {
          state.rafQueue.push(callback);
          return;
        }
        callback(timestamp);
      }),
    );
  }

  state.installed = true;
}

function uninstall(view: FreezeWindow, state: WindowFreezeState): void {
  if (!state.installed) return;
  for (const [name, descriptor] of state.descriptors) {
    if (descriptor) Object.defineProperty(view, name, descriptor);
    else delete (view as unknown as Record<string, unknown>)[name];
  }
  state.descriptors.clear();
  state.installed = false;
  state.timeoutQueue = [];
  state.rafQueue = [];
}

/**
 * Timer functions that bypass the freeze wrappers for the given document. Safe
 * to call whether or not a freeze controller exists — importing this module
 * still installs nothing.
 */
export function getUnfrozenScheduler(document: Document | undefined): UnfrozenScheduler {
  const view = document?.defaultView as FreezeWindow | null | undefined;
  if (!view) {
    const noop = () => 0;
    return {
      setTimeout: noop as unknown as Window["setTimeout"],
      clearTimeout: () => undefined,
      setInterval: noop as unknown as Window["setInterval"],
      clearInterval: () => undefined,
      requestAnimationFrame: noop as unknown as Window["requestAnimationFrame"],
      cancelAnimationFrame: () => undefined,
    };
  }
  const existing = view[STATE_KEY];
  return existing ? existing.original : nativeScheduler(view);
}

export function createAnimationFreezeController(
  document: Document,
): AnimationFreezeController {
  const view = document.defaultView as FreezeWindow | null;
  if (!view) throw new Error("Agentation requires a Document attached to a Window");

  const state = readState(view);
  state.controllers += 1;
  install(view, state);

  let frozen = false;
  let destroyed = false;

  const excluded = (element: Element | null): boolean => {
    if (!element) return false;
    if (element.closest?.("agentation-overlay")) return true;
    return EXCLUDE_ATTRS.some((attribute) => Boolean(element.closest?.(`[${attribute}]`)));
  };

  const controller: AnimationFreezeController = {
    get frozen() {
      return frozen;
    },
    scheduler: state.original,

    freeze() {
      if (destroyed || frozen) return;
      frozen = true;
      state.freezeDepth += 1;
      if (state.freezeDepth > 1) return;

      state.timeoutQueue = [];
      state.rafQueue = [];

      let style = document.getElementById(STYLE_ID);
      if (!style) {
        style = document.createElement("style");
        style.id = STYLE_ID;
      }
      style.textContent = `
    *${NOT_SELECTORS},
    *${NOT_SELECTORS}::before,
    *${NOT_SELECTORS}::after {
      animation-play-state: paused !important;
      transition: none !important;
    }
  `;
      document.head.appendChild(style);

      // Pausing a *finished* animation restarts it on play(), which would
      // replay entrance animations, so only running ones are captured.
      state.pausedAnimations = [];
      try {
        for (const animation of document.getAnimations?.() ?? []) {
          if (animation.playState !== "running") continue;
          const target = (animation.effect as KeyframeEffect | null)?.target ?? null;
          if (excluded(target)) continue;
          animation.pause();
          state.pausedAnimations.push(animation);
        }
      } catch {
        // Degrade without throwing where getAnimations is unavailable.
      }

      for (const video of document.querySelectorAll("video")) {
        if (!video.paused) {
          video.dataset.wasPaused = "false";
          video.pause();
        }
      }
    },

    unfreeze() {
      if (!frozen) return;
      frozen = false;
      state.freezeDepth = Math.max(0, state.freezeDepth - 1);
      if (state.freezeDepth > 0) return;

      const timeoutQueue = state.timeoutQueue;
      state.timeoutQueue = [];
      for (const callback of timeoutQueue) {
        state.original.setTimeout(() => {
          if (state.freezeDepth > 0) {
            state.timeoutQueue.push(callback);
            return;
          }
          try {
            callback();
          } catch (error) {
            console.warn("[agentation] Error replaying queued timeout:", error);
          }
        }, 0);
      }

      const rafQueue = state.rafQueue;
      state.rafQueue = [];
      if (typeof state.original.requestAnimationFrame === "function") {
        for (const callback of rafQueue) {
          state.original.requestAnimationFrame((timestamp) => {
            if (state.freezeDepth > 0) {
              state.rafQueue.push(callback);
              return;
            }
            callback(timestamp);
          });
        }
      }

      // Resume the exact animations we paused *before* dropping the CSS:
      // removing it first can make the browser replace the animation objects.
      for (const animation of state.pausedAnimations) {
        try {
          animation.play();
        } catch (error) {
          console.warn("[agentation] Error resuming animation:", error);
        }
      }
      state.pausedAnimations = [];

      document.getElementById(STYLE_ID)?.remove();

      for (const video of document.querySelectorAll("video")) {
        if (video.dataset.wasPaused === "false") {
          void video.play().catch(() => undefined);
          delete video.dataset.wasPaused;
        }
      }
    },

    destroy() {
      if (destroyed) return;
      controller.unfreeze();
      destroyed = true;
      state.controllers = Math.max(0, state.controllers - 1);
      if (state.controllers > 0) return;
      uninstall(view, state);
      // Drop the cache with the last controller. `state.original` holds bound
      // references to the window's timer functions as they were when the first
      // controller appeared; keeping them would pin a torn-down realm's
      // functions and make a later controller schedule through stale ones.
      delete view[STATE_KEY];
    },
  };

  return controller;
}

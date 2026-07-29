// =============================================================================
// Runtime Environment
// =============================================================================
//
// Every browser-realm capability the runtime needs, resolved from the document
// that owns the custom element. Nothing in `src/browser/**` may reach for the
// ambient `window`, `document`, `localStorage`, `fetch`, `crypto`, `performance`
// or DOM constructors: two Agentation instances living in two iframes must not
// read or mutate each other's realm.
// =============================================================================

import { getUnfrozenScheduler } from "../utils/freeze-animations";

export type StorageLike = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem" | "key" | "length"
>;

export type RuntimeTimers = {
  setTimeout(handler: () => void, timeout?: number): number;
  clearTimeout(handle: number | undefined): void;
  setInterval(handler: () => void, timeout?: number): number;
  clearInterval(handle: number | undefined): void;
  requestAnimationFrame(callback: FrameRequestCallback): number;
  cancelAnimationFrame(handle: number | undefined): void;
};

export interface RuntimeEnvironment {
  /** The document that owns the custom element. */
  readonly document: Document;
  /** The window that owns `document`. */
  readonly window: Window & typeof globalThis;

  // --- DOM constructors (realm-correct `instanceof` checks) -----------------
  readonly HTMLElement: typeof HTMLElement;
  readonly HTMLInputElement: typeof HTMLInputElement;
  readonly HTMLTextAreaElement: typeof HTMLTextAreaElement;
  readonly HTMLSelectElement: typeof HTMLSelectElement;
  readonly Element: typeof Element;
  readonly Node: typeof Node;
  readonly ShadowRoot: typeof ShadowRoot;
  readonly DOMRect: typeof DOMRect;
  readonly CustomEvent: typeof CustomEvent;
  readonly AbortController: typeof AbortController;
  /** Absent in environments without server-sent events (jsdom). */
  readonly EventSource: typeof EventSource | undefined;

  // --- Element construction -------------------------------------------------
  createElement<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
  ): HTMLElementTagNameMap[K];
  createSvg<K extends keyof SVGElementTagNameMap>(
    tag: K,
    attributes?: Record<string, string>,
  ): SVGElementTagNameMap[K];

  // --- Storage (never throws; failures surface through the returned flag) ---
  readonly localStorage: StorageLike | undefined;
  readonly sessionStorage: StorageLike | undefined;

  // --- Network --------------------------------------------------------------
  fetch(input: string, init?: RequestInit): Promise<Response>;
  /** `navigator.clipboard.writeText`, or a rejection when unavailable. */
  writeClipboardText(text: string): Promise<void>;

  // --- Identity / clocks ----------------------------------------------------
  randomId(prefix: string): string;
  now(): number;
  /** Monotonic clock used for gesture thresholds and click suppression. */
  monotonic(): number;

  // --- Timers ---------------------------------------------------------------
  readonly timers: RuntimeTimers;

  // --- Layout / styling -----------------------------------------------------
  computedStyle(element: Element, pseudo?: string): CSSStyleDeclaration;
  readonly innerWidth: number;
  readonly innerHeight: number;
  readonly scrollX: number;
  readonly scrollY: number;
  readonly devicePixelRatio: number;

  // --- Location -------------------------------------------------------------
  readonly pathname: string;
  readonly href: string;

  // --- Misc -----------------------------------------------------------------
  escapeSelector(value: string): string;
  getSelectionText(): string;
  clearSelection(): void;
  /** True when the primary shortcut modifier for this platform is Meta. */
  readonly isApplePlatform: boolean;
}

function safeStorage(read: () => Storage | null): StorageLike | undefined {
  try {
    const storage = read();
    if (!storage) return undefined;
    // Touching `length` throws in Safari private mode / blocked third-party
    // contexts, which is exactly the failure we want to detect up front.
    void storage.length;
    return storage;
  } catch {
    return undefined;
  }
}

const CSS_ESCAPE_UNSAFE = /[^\w-]/g;

export function createRuntimeEnvironment(document: Document): RuntimeEnvironment {
  const view = document.defaultView as (Window & typeof globalThis) | null;
  if (!view) {
    throw new Error("Agentation requires a Document attached to a Window");
  }

  const cryptoRef: Crypto | undefined = view.crypto;
  const performanceRef: Performance | undefined = view.performance;
  const cssRef = (view as Window & { CSS?: typeof CSS }).CSS;

  // Resolved ONCE, and through `getUnfrozenScheduler` so it yields the true
  // natives whether or not a freeze controller has already patched the window.
  //
  // This is the whole point of `environment.timers`: everything Agentation
  // renders — popup enter/exit, the 50 ms editor autofocus, toolbar tooltips,
  // marker exits, settings transitions — must keep running while the page is
  // frozen, because freezing the page is a feature the user drives FROM that
  // UI. Reading `view.setTimeout` at call time would hand back the freeze
  // wrapper and queue Agentation's own animations until unfreeze.
  const unfrozen = getUnfrozenScheduler(document);

  const timers: RuntimeTimers = {
    setTimeout: (handler, timeout) => unfrozen.setTimeout(handler, timeout),
    clearTimeout: (handle) => {
      if (handle !== undefined) unfrozen.clearTimeout(handle);
    },
    setInterval: (handler, timeout) => unfrozen.setInterval(handler, timeout),
    clearInterval: (handle) => {
      if (handle !== undefined) unfrozen.clearInterval(handle);
    },
    requestAnimationFrame: (callback) =>
      typeof unfrozen.requestAnimationFrame === "function"
        ? unfrozen.requestAnimationFrame(callback)
        : unfrozen.setTimeout(() => callback(performanceRef?.now() ?? Date.now()), 16),
    cancelAnimationFrame: (handle) => {
      if (handle === undefined) return;
      if (typeof unfrozen.cancelAnimationFrame === "function") {
        unfrozen.cancelAnimationFrame(handle);
      } else {
        unfrozen.clearTimeout(handle);
      }
    },
  };

  const platform =
    (view.navigator as Navigator & { userAgentData?: { platform?: string } })?.userAgentData
      ?.platform ??
    view.navigator?.platform ??
    "";

  return {
    document,
    window: view,

    HTMLElement: view.HTMLElement,
    HTMLInputElement: view.HTMLInputElement,
    HTMLTextAreaElement: view.HTMLTextAreaElement,
    HTMLSelectElement: view.HTMLSelectElement,
    Element: view.Element,
    Node: view.Node,
    ShadowRoot: view.ShadowRoot,
    DOMRect: view.DOMRect,
    CustomEvent: view.CustomEvent,
    AbortController: view.AbortController,
    EventSource: typeof view.EventSource === "function" ? view.EventSource : undefined,

    createElement(tag, className) {
      const element = document.createElement(tag);
      if (className) element.className = className;
      return element;
    },
    createSvg(tag, attributes) {
      const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
      if (attributes) {
        for (const [name, value] of Object.entries(attributes)) {
          element.setAttribute(name, value);
        }
      }
      return element as SVGElementTagNameMap[typeof tag];
    },

    localStorage: safeStorage(() => view.localStorage),
    sessionStorage: safeStorage(() => view.sessionStorage),

    fetch(input, init) {
      if (typeof view.fetch !== "function") {
        return Promise.reject(new Error("fetch is unavailable in this environment"));
      }
      return view.fetch(input, init);
    },
    writeClipboardText(text) {
      const clipboard = view.navigator?.clipboard;
      if (!clipboard?.writeText) {
        return Promise.reject(new Error("Clipboard API is unavailable"));
      }
      return clipboard.writeText(text);
    },

    randomId(prefix) {
      if (cryptoRef && typeof cryptoRef.randomUUID === "function") {
        return `${prefix}_${cryptoRef.randomUUID()}`;
      }
      if (cryptoRef && typeof cryptoRef.getRandomValues === "function") {
        const bytes = cryptoRef.getRandomValues(new Uint8Array(8));
        let out = "";
        for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
        return `${prefix}_${out}`;
      }
      return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    },
    now() {
      return Date.now();
    },
    monotonic() {
      return performanceRef?.now() ?? Date.now();
    },

    timers,

    computedStyle(element, pseudo) {
      return view.getComputedStyle(element, pseudo);
    },
    get innerWidth() {
      return view.innerWidth;
    },
    get innerHeight() {
      return view.innerHeight;
    },
    get scrollX() {
      return view.scrollX ?? view.pageXOffset ?? 0;
    },
    get scrollY() {
      return view.scrollY ?? view.pageYOffset ?? 0;
    },
    get devicePixelRatio() {
      return view.devicePixelRatio || 1;
    },

    get pathname() {
      return view.location.pathname;
    },
    get href() {
      return view.location.href;
    },

    escapeSelector(value) {
      if (cssRef && typeof cssRef.escape === "function") return cssRef.escape(value);
      return value.replace(CSS_ESCAPE_UNSAFE, (character) => `\\${character}`);
    },
    getSelectionText() {
      try {
        return view.getSelection()?.toString() ?? "";
      } catch {
        return "";
      }
    },
    clearSelection() {
      try {
        view.getSelection()?.removeAllRanges();
      } catch {
        // Selection may be unavailable in exotic embedding contexts.
      }
    },
    isApplePlatform: /mac|iphone|ipad|ipod/i.test(platform),
  };
}

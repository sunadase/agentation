// =============================================================================
// Shared fixture harness
// =============================================================================
//
// The specs drive the toolbar through real user input only. They still have to
// observe what a *consumer application* saw, so every fixture page installs the
// same recorder: config callbacks and `onEvent` append to `window.__harness`,
// and the specs read that log.
//
// This is deliberately consumer-side instrumentation. Nothing here reaches into
// the runtime: the recorder only sees the public callbacks and the public
// `agentation` CustomEvent, exactly what a real integration sees.
// =============================================================================

// Types come from the framework-free subpath on purpose: the browser fixture
// page must not pull React in just to describe its own config.
import type {
  AgentationConfig,
  AgentationEvent,
  Annotation,
} from "agentation/browser";

export type HarnessCall = {
  name: string;
  /** Which config generation owned the callback. Proves `configure` landed. */
  generation: number;
  output?: string;
  comment?: string;
  count?: number;
  sessionId?: string;
};

export type HarnessEvent = {
  type: string;
  reason?: string;
  operation?: string;
  message?: string;
  current?: number;
  output?: string;
  sessionId?: string;
};

export type Harness = {
  readonly calls: HarnessCall[];
  readonly events: HarnessEvent[];
  /** Messages from mount attempts that threw, e.g. the double-mount guard. */
  readonly mountErrors: string[];
  /** Bumped by the "Reconfigure" control; tags callbacks with their vintage. */
  generation: number;
  /** `setInterval` ticks. Frozen pages must not advance this. */
  intervalTicks: number;
  /** Chained `setTimeout` ticks. Frozen pages queue, then drain once. */
  timeoutTicks: number;
  mounted: boolean;
};

declare global {
  interface Window {
    __harness: Harness;
  }
}

export function installHarness(): Harness {
  const harness: Harness = {
    calls: [],
    events: [],
    mountErrors: [],
    generation: 0,
    intervalTicks: 0,
    timeoutTicks: 0,
    mounted: false,
  };
  window.__harness = harness;
  return harness;
}

let pageTimersStarted = false;

/**
 * Starts the page-owned timers whose counters the freeze spec reads.
 *
 * Called AFTER the runtime mounts, and idempotent. The freeze controller works by
 * replacing the window's timer functions when the first runtime is created, so a
 * timer registered before that holds the original function and can never be
 * intercepted — inherent to the approach, not a defect. Registering here is what
 * makes these counters test the contract that actually exists.
 */
export function startPageTimers(): void {
  if (pageTimersStarted) return;
  pageTimersStarted = true;
  const harness = window.__harness;
  setInterval(() => {
    harness.intervalTicks += 1;
  }, 50);
  const tick = (): void => {
    harness.timeoutTicks += 1;
    setTimeout(tick, 50);
  };
  setTimeout(tick, 50);
}

/** URL-driven config so specs vary integration shape with a plain navigation. */
export function readSearchConfig(): {
  endpoint?: string;
  webhookUrl?: string;
  sessionId?: string;
  className?: string;
  withSubmit: boolean;
  copyToClipboard: boolean;
  autoMount: boolean;
} {
  const params = new URLSearchParams(window.location.search);
  const get = (key: string): string | undefined => {
    const value = params.get(key);
    return value === null || value === "" ? undefined : value;
  };
  return {
    endpoint: get("endpoint"),
    webhookUrl: get("webhook"),
    sessionId: get("session"),
    className: get("class"),
    withSubmit: params.get("submit") === "1",
    copyToClipboard: params.get("clipboard") !== "0",
    autoMount: params.get("mount") !== "0",
  };
}

/**
 * The config a fixture page hands to Agentation. `generation` is captured by
 * value so a spec can prove that after "Reconfigure" only the newest callbacks
 * fire — the React/Solid adapters must not pin the first render's closures.
 */
export function harnessConfig(generation: number): AgentationConfig {
  const harness = window.__harness;
  const search = readSearchConfig();

  const record = (name: string, extra: Partial<HarnessCall> = {}): void => {
    harness.calls.push({ name, generation, ...extra });
  };

  const config: AgentationConfig = {
    endpoint: search.endpoint,
    webhookUrl: search.webhookUrl,
    sessionId: search.sessionId,
    className: search.className,
    copyToClipboard: search.copyToClipboard,
    onAnnotationAdd: (annotation: Annotation) =>
      record("onAnnotationAdd", { comment: annotation.comment }),
    onAnnotationUpdate: (annotation: Annotation) =>
      record("onAnnotationUpdate", { comment: annotation.comment }),
    onAnnotationDelete: (annotation: Annotation) =>
      record("onAnnotationDelete", { comment: annotation.comment }),
    onAnnotationsClear: (annotations: Annotation[]) =>
      record("onAnnotationsClear", { count: annotations.length }),
    onCopy: (markdown: string) => record("onCopy", { output: markdown }),
    onSessionCreated: (sessionId: string) => record("onSessionCreated", { sessionId }),
    onEvent: (event: AgentationEvent) => {
      const detail = event.detail;
      const entry: HarnessEvent = { type: detail.type };
      if (detail.type === "annotations") {
        entry.reason = detail.reason;
        entry.current = detail.current.length;
      } else if (detail.type === "error") {
        entry.operation = detail.operation;
        entry.message = detail.message;
      } else if (detail.type === "copy" || detail.type === "submit") {
        entry.output = detail.output;
      } else if (detail.type === "session-created") {
        entry.sessionId = detail.sessionId;
      }
      harness.events.push(entry);
    },
  };

  if (search.withSubmit) {
    config.onSubmit = (output: string) => record("onSubmit", { output });
  }
  return config;
}

/**
 * The lifecycle control bar. Real buttons, because the lifecycle spec must use
 * real clicks: a spec calling `controller.destroy()` through `page.evaluate`
 * would prove the runtime works, not that a consumer can drive it.
 */
export type HarnessControls = {
  onMount: () => void;
  onUnmount: () => void;
  onReconfigure: () => void;
  onMountSecond: () => void;
};

export const CONTROL_IDS = {
  bar: "harness-controls",
  mount: "harness-mount",
  unmount: "harness-unmount",
  reconfigure: "harness-reconfigure",
  mountSecond: "harness-mount-second",
  state: "harness-state",
} as const;

export function renderControls(
  host: HTMLElement,
  controls: HarnessControls,
): void {
  host.id = CONTROL_IDS.bar;
  host.replaceChildren();

  const style = document.createElement("style");
  style.textContent = `
    #${CONTROL_IDS.bar} {
      display: flex;
      gap: 8px;
      align-items: center;
      padding: 8px 24px;
      font: 13px/1.4 "DejaVu Sans", "Liberation Sans", Arial, sans-serif;
      background: #111827;
      color: #f9fafb;
    }
    #${CONTROL_IDS.bar} button {
      height: 26px;
      padding: 0 10px;
      border: 1px solid #4b5563;
      border-radius: 4px;
      background: #1f2937;
      color: inherit;
      font: inherit;
      cursor: pointer;
    }
  `;

  const state = document.createElement("span");
  state.id = CONTROL_IDS.state;

  const button = (id: string, label: string, run: () => void): HTMLButtonElement => {
    const node = document.createElement("button");
    node.id = id;
    node.type = "button";
    node.textContent = label;
    node.addEventListener("click", run);
    return node;
  };

  host.append(
    style,
    button(CONTROL_IDS.mount, "Mount", controls.onMount),
    button(CONTROL_IDS.unmount, "Unmount", controls.onUnmount),
    button(CONTROL_IDS.reconfigure, "Reconfigure", controls.onReconfigure),
    button(CONTROL_IDS.mountSecond, "Mount second", controls.onMountSecond),
    state,
  );
  syncControlState();
}

export function syncControlState(): void {
  const node = document.getElementById(CONTROL_IDS.state);
  if (node) node.textContent = window.__harness.mounted ? "mounted" : "unmounted";
}

/** Records a mount attempt that threw instead of letting it break the page. */
export function recordMountError(cause: unknown): void {
  window.__harness.mountErrors.push(
    cause instanceof Error ? cause.message : String(cause),
  );
}

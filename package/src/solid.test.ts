import { createRoot, createSignal } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Agentation, type AgentationProps } from "./solid";
import type { AgentationElement } from "./browser/types";
import type { Annotation } from "./types";

const RECT = {
  x: 20,
  y: 30,
  left: 20,
  top: 30,
  right: 140,
  bottom: 70,
  width: 120,
  height: 40,
  toJSON: () => ({}),
} as DOMRect;

const disposers: Array<() => void> = [];

function mount(props: AgentationProps): () => void {
  let dispose = () => {};
  createRoot((disposeRoot) => {
    dispose = disposeRoot;
    Agentation(props);
  });
  disposers.push(dispose);
  return dispose;
}

function overlay(): AgentationElement {
  const element = document.querySelector("agentation-overlay");
  if (!element) throw new Error("overlay not mounted");
  return element as AgentationElement;
}

/** Drives the real toolbar the way a user would: activate, click, type, save. */
function annotate(target: HTMLElement, comment: string): void {
  const root = overlay().shadowRoot!;
  // jsdom lays nothing out, so pointer hit testing has to be stubbed.
  document.elementFromPoint = () => target;
  document.elementsFromPoint = () => [target];
  root.querySelector<HTMLElement>(".ag-toolbar-container")!.click();
  target.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true, clientX: 80, clientY: 50 }),
  );
  const textarea = root.querySelector<HTMLTextAreaElement>(".ag-popup-textarea")!;
  textarea.value = comment;
  textarea.dispatchEvent(new InputEvent("input", { bubbles: true }));
  root.querySelector<HTMLButtonElement>(".ag-popup-submit")!.click();
}

beforeEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
});

afterEach(() => {
  while (disposers.length) disposers.pop()?.();
  document.body.replaceChildren();
  localStorage.clear();
});

describe("Solid lifecycle wrapper", () => {
  it("mounts the custom element on the client", () => {
    mount({ copyToClipboard: false });

    expect(overlay().shadowRoot?.querySelector(".ag-toolbar-container")).not.toBeNull();
  });

  it("reaches the controller when a reactive config value changes", () => {
    const [name, setName] = createSignal("first-shell");
    mount({
      copyToClipboard: false,
      get className() {
        return name();
      },
    });
    expect(overlay().className).toBe("first-shell");

    setName("second-shell");

    expect(overlay().className).toBe("second-shell");
    expect(overlay().config.className).toBe("second-shell");
  });

  it("invokes the latest callback after reconfiguration", () => {
    const first = vi.fn();
    const second = vi.fn();
    const [callback, setCallback] = createSignal<(annotation: Annotation) => void>(first);
    const target = document.createElement("button");
    target.textContent = "Save profile";
    target.getBoundingClientRect = () => RECT;
    document.body.append(target);
    mount({
      copyToClipboard: false,
      get onAnnotationAdd() {
        return callback();
      },
    });

    setCallback(() => second);
    annotate(target, "Increase the hit target");

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(second.mock.calls[0][0]).toMatchObject({ comment: "Increase the hit target" });
  });

  it("prefers class over className", () => {
    mount({ copyToClipboard: false, class: "solid-class", className: "legacy-class" });

    expect(overlay().config.className).toBe("solid-class");
    expect(overlay().className).toBe("solid-class");
  });

  it("uses className when class is absent", () => {
    mount({ copyToClipboard: false, className: "legacy-class" });

    expect(overlay().config.className).toBe("legacy-class");
  });

  it("installs exactly one Solid metadata adapter and reuses it across reconfiguration", () => {
    const [name, setName] = createSignal("a");
    mount({
      copyToClipboard: false,
      get className() {
        return name();
      },
    });
    const initial = overlay().config.metadata;
    expect(initial).toHaveLength(1);
    expect(initial?.[0]?.id).toBe("solid");

    setName("b");
    setName("c");

    expect(overlay().config.metadata).toBe(initial);
  });

  it("treats an explicit empty metadata array as disabled metadata", () => {
    mount({ copyToClipboard: false, metadata: [] });

    expect(overlay().config.metadata).toEqual([]);
  });

  it("keeps caller-supplied adapters untouched", () => {
    const metadata = [{ id: "custom", inspect: () => undefined }];
    mount({ copyToClipboard: false, metadata });

    expect(overlay().config.metadata).toBe(metadata);
  });

  it("removes the element on cleanup and remounts cleanly", () => {
    const dispose = mount({ copyToClipboard: false });

    dispose();
    expect(document.querySelector("agentation-overlay")).toBeNull();

    mount({ copyToClipboard: false });
    expect(overlay().isConnected).toBe(true);
  });

  it("is idempotent when cleanup runs twice", () => {
    const dispose = mount({ copyToClipboard: false });

    dispose();
    expect(() => dispose()).not.toThrow();
    expect(document.querySelector("agentation-overlay")).toBeNull();
  });

  it("refuses a second mount in the same document", () => {
    mount({ copyToClipboard: false });

    expect(() => mount({ copyToClipboard: false })).toThrow(/one Agentation instance/i);
  });
});

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Agentation, PageFeedbackToolbarCSS } from "./react";
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

function Harness({ onAdd }: { onAdd: (annotation: Annotation) => void }) {
  return <Agentation copyToClipboard={false} onAnnotationAdd={onAdd} />;
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
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  localStorage.clear();
});

describe("React compatibility wrapper", () => {
  it("mounts the custom element and removes it on unmount", () => {
    const view = render(<Agentation copyToClipboard={false} />);
    const element = document.querySelector("agentation-overlay");
    expect(element?.shadowRoot?.querySelector(".ag-toolbar-container")).not.toBeNull();

    view.unmount();
    expect(document.querySelector("agentation-overlay")).toBeNull();
  });

  it("keeps PageFeedbackToolbarCSS as a source-compatible alias", () => {
    expect(PageFeedbackToolbarCSS).toBe(Agentation);
  });

  it("reuses one controller across parent rerenders and calls the newest callback", () => {
    const first = vi.fn();
    const second = vi.fn();
    const target = document.createElement("button");
    target.textContent = "Save profile";
    target.getBoundingClientRect = () => RECT;
    document.body.append(target);
    const view = render(<Harness onAdd={first} />);
    const mounted = overlay();

    view.rerender(<Harness onAdd={second} />);

    expect(overlay()).toBe(mounted);
    expect(mounted.isConnected).toBe(true);

    annotate(target, "Increase the hit target");

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(second.mock.calls[0][0]).toMatchObject({ comment: "Increase the hit target" });
  });

  it("installs exactly one React metadata adapter and reuses it across rerenders", () => {
    const view = render(<Harness onAdd={vi.fn()} />);
    const initial = overlay().config.metadata;
    expect(initial).toHaveLength(1);
    expect(initial?.[0]?.id).toBe("react");

    view.rerender(<Harness onAdd={vi.fn()} />);
    view.rerender(<Harness onAdd={vi.fn()} />);

    expect(overlay().config.metadata).toBe(initial);
  });
});

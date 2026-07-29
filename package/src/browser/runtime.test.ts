import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountAgentation } from "./runtime";
import type { AgentationEvent } from "./types";

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

/**
 * The runtime resolves annotation targets from pointer coordinates, matching the
 * original toolbar, so hit testing has to be stubbed: jsdom's `elementFromPoint`
 * always returns `null` because it does not lay anything out.
 */
function hitTest(element: Element | null): void {
  document.elementFromPoint = () => element;
  document.elementsFromPoint = () => (element ? [element] : []);
}

function pageButton(): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = "Save profile";
  button.getBoundingClientRect = () => RECT;
  document.body.append(button);
  hitTest(button);
  return button;
}

function shadow(controller: { element: { shadowRoot: ShadowRoot | null } }): ShadowRoot {
  const root = controller.element.shadowRoot;
  if (!root) throw new Error("Agentation did not attach a shadow root");
  return root;
}

/** Toolbar buttons are addressed the way a user's assistive tech would. */
function control(root: ShadowRoot, label: string): HTMLButtonElement {
  const button = root.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!button) throw new Error(`No toolbar control labelled "${label}"`);
  return button;
}

function activate(root: ShadowRoot): void {
  root.querySelector<HTMLElement>(".ag-toolbar-container")!.click();
}

function annotate(root: ShadowRoot, target: Element, comment: string): void {
  target.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true, clientX: 80, clientY: 50 }),
  );
  const textarea = root.querySelector<HTMLTextAreaElement>(".ag-popup-textarea")!;
  textarea.value = comment;
  textarea.dispatchEvent(new InputEvent("input", { bubbles: true }));
  root.querySelector<HTMLButtonElement>(".ag-popup-submit")!.click();
}

function pageDiv(text: string): HTMLDivElement {
  const element = document.createElement("div");
  element.textContent = text;
  element.getBoundingClientRect = () => RECT;
  document.body.append(element);
  return element;
}

/** Completes an editor the runtime has already opened. */
function annotateOpenEditor(root: ShadowRoot, comment: string): void {
  const textarea = root.querySelector<HTMLTextAreaElement>(".ag-popup-textarea")!;
  textarea.value = comment;
  textarea.dispatchEvent(new InputEvent("input", { bubbles: true }));
  root.querySelector<HTMLButtonElement>(".ag-popup-submit")!.click();
}

beforeEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
  hitTest(null);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  localStorage.clear();
});

describe("native Agentation runtime", () => {
  it("mounts once per document and releases the document on destroy", () => {
    const first = mountAgentation(document);
    expect(shadow(first).querySelector(".ag-toolbar-container")).not.toBeNull();
    expect(() => mountAgentation(document)).toThrow(/one Agentation instance/i);

    first.destroy();
    expect(document.querySelector("agentation-overlay")).toBeNull();

    const second = mountAgentation(document);
    expect(second.element.isConnected).toBe(true);
    second.destroy();
  });

  it("annotates a page element with framework-neutral metadata", () => {
    const button = pageButton();
    const onAnnotationAdd = vi.fn();
    const controller = mountAgentation(document, {
      onAnnotationAdd,
      metadata: [
        {
          id: "solid",
          inspect: () => ({
            componentPath: ["App", "Profile", "Button"],
            source: { file: "src/Profile.tsx", line: 42, column: 7 },
            confidence: "exact",
          }),
        },
      ],
    });
    const root = shadow(controller);

    activate(root);
    annotate(root, button, "Increase the hit target");

    expect(onAnnotationAdd).toHaveBeenCalledTimes(1);
    const annotation = onAnnotationAdd.mock.calls[0][0];
    expect(annotation).toMatchObject({
      comment: "Increase the hit target",
      framework: {
        name: "solid",
        componentPath: ["App", "Profile", "Button"],
        source: { file: "src/Profile.tsx", line: 42, column: 7 },
        confidence: "exact",
      },
      sourceFile: "src/Profile.tsx:42:7",
    });
    // React-specific presentation must not leak out of a Solid adapter.
    expect(annotation.reactComponents).toBeUndefined();
    expect(controller.getAnnotations()).toHaveLength(1);
    expect(root.querySelectorAll(".ag-marker")).toHaveLength(1);

    controller.destroy();
  });

  it("rejects an empty comment instead of creating an annotation", () => {
    const button = pageButton();
    const onAnnotationAdd = vi.fn();
    const controller = mountAgentation(document, { onAnnotationAdd });
    const root = shadow(controller);

    activate(root);
    annotate(root, button, "   ");

    expect(onAnnotationAdd).not.toHaveBeenCalled();
    expect(controller.getAnnotations()).toHaveLength(0);
    controller.destroy();
  });

  it("restores annotations for the route and renders their markers", () => {
    localStorage.setItem(
      "feedback-annotations-/",
      JSON.stringify([
        {
          id: "ann_1",
          x: 50,
          y: 100,
          comment: "Use the primary token",
          element: "button",
          elementPath: "main > button",
          timestamp: Date.now(),
        },
      ]),
    );

    const controller = mountAgentation(document);
    const root = shadow(controller);
    activate(root);

    expect(controller.getAnnotations()).toHaveLength(1);
    expect(root.querySelectorAll(".ag-marker")).toHaveLength(1);
    controller.destroy();
  });

  it("reports the copied output and writes exactly that to the clipboard", async () => {
    localStorage.setItem(
      "feedback-annotations-/",
      JSON.stringify([
        {
          id: "ann_1",
          x: 50,
          y: 100,
          comment: "Use the primary token",
          element: "button",
          elementPath: "main > button",
          timestamp: Date.now(),
        },
      ]),
    );

    const controller = mountAgentation(document);
    const root = shadow(controller);

    let output = "";
    controller.element.addEventListener("agentation", ((event: AgentationEvent) => {
      if (event.detail.type !== "copy") return;
      output = event.detail.output;
      event.preventDefault();
    }) as EventListener);

    activate(root);
    control(root, "Copy feedback").click();
    // Copying awaits the clipboard write, so the report lands a microtask later.
    await vi.waitFor(() => expect(output).not.toBe(""));

    expect(output).toContain("Use the primary token");
    // `copy` is emitted after the write, so a listener cannot suppress it; the
    // contract is that the event carries exactly what was copied.
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(output);
    controller.destroy();
  });

  it("honours copyToClipboard: false while still reporting the output", async () => {
    localStorage.setItem(
      "feedback-annotations-/",
      JSON.stringify([
        {
          id: "ann_1",
          x: 50,
          y: 100,
          comment: "Use the primary token",
          element: "button",
          elementPath: "main > button",
          timestamp: Date.now(),
        },
      ]),
    );

    const onCopy = vi.fn();
    const controller = mountAgentation(document, { copyToClipboard: false, onCopy });
    const root = shadow(controller);

    activate(root);
    control(root, "Copy feedback").click();
    await vi.waitFor(() => expect(onCopy).toHaveBeenCalledTimes(1));

    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    expect(onCopy.mock.calls[0][0]).toContain("Use the primary token");
    controller.destroy();
  });

  it("deletes an annotation and reports it exactly once", async () => {
    vi.useFakeTimers();
    try {
      const button = pageButton();
      const onAnnotationDelete = vi.fn();
      const controller = mountAgentation(document, { onAnnotationDelete });
      const root = shadow(controller);

      activate(root);
      annotate(root, button, "Remove me");
      expect(controller.getAnnotations()).toHaveLength(1);

      const [annotation] = controller.getAnnotations();
      // Default marker behaviour is edit, so deletion goes through the popup.
      root.querySelector<HTMLButtonElement>(`.ag-marker[data-id="${annotation.id}"]`)!.click();
      root.querySelector<HTMLButtonElement>(".ag-popup-delete")!.click();

      // The marker plays its exit before the record is dropped.
      await vi.advanceTimersByTimeAsync(300);
      expect(onAnnotationDelete).toHaveBeenCalledTimes(1);
      expect(onAnnotationDelete.mock.calls[0][0]).toMatchObject({ comment: "Remove me" });
      expect(controller.getAnnotations()).toHaveLength(0);
      controller.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a non-http endpoint instead of silently going local-only", () => {
    const controller = mountAgentation(document);
    expect(() => controller.configure({ endpoint: "ftp://example.com" })).toThrow(
      /http\(s\) URL/i,
    );
    expect(() => controller.configure({ webhookUrl: "javascript:alert(1)" })).toThrow(
      /http\(s\) URL/i,
    );
    controller.destroy();
  });

  it("refuses to configure a destroyed controller", () => {
    const controller = mountAgentation(document);
    controller.destroy();
    expect(() => controller.configure({})).toThrow(/destroyed/i);
    expect(controller.getAnnotations()).toEqual([]);
  });

  describe("click precedence on interactive controls", () => {
    it("annotates and consumes the click while blocking is on", () => {
      const button = pageButton();
      const pageHandler = vi.fn();
      button.addEventListener("click", pageHandler);
      const controller = mountAgentation(document);
      const root = shadow(controller);

      activate(root);
      annotate(root, button, "Widen this control");

      expect(controller.getAnnotations()).toHaveLength(1);
      // The page handler must not also run, or annotating a submit button would
      // submit the form.
      expect(pageHandler).not.toHaveBeenCalled();
      controller.destroy();
    });

    it("lets the control act and creates no annotation while blocking is off", () => {
      localStorage.setItem(
        "feedback-toolbar-settings",
        JSON.stringify({ blockInteractions: false }),
      );
      const button = pageButton();
      const pageHandler = vi.fn();
      button.addEventListener("click", pageHandler);
      const controller = mountAgentation(document);
      const root = shadow(controller);

      activate(root);
      button.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, clientX: 80, clientY: 50 }),
      );

      expect(pageHandler).toHaveBeenCalledTimes(1);
      // The control acted; no editor opened, so nothing can be annotated.
      expect(root.querySelector<HTMLElement>(".ag-popup")!.hidden).toBe(true);
      expect(controller.getAnnotations()).toHaveLength(0);
      controller.destroy();
    });

    it("still annotates a non-interactive target while blocking is off", () => {
      localStorage.setItem(
        "feedback-toolbar-settings",
        JSON.stringify({ blockInteractions: false }),
      );
      const card = pageDiv("Pricing card");
      hitTest(card);
      const controller = mountAgentation(document);
      const root = shadow(controller);

      activate(root);
      annotate(root, card, "Tighten the spacing");

      expect(controller.getAnnotations()).toHaveLength(1);
      controller.destroy();
    });
  });

  describe("modifier selection", () => {
    function modifierClick(target: Element): void {
      hitTest(target);
      target.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          clientX: 80,
          clientY: 50,
          ctrlKey: true,
          metaKey: true,
          shiftKey: true,
        }),
      );
    }

    function releaseModifiers(): void {
      document.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift", bubbles: true }));
    }

    it("groups several targets into one multi-select annotation", () => {
      const first = pageDiv("Feature one");
      const second = pageDiv("Feature two");
      const controller = mountAgentation(document);
      const root = shadow(controller);

      activate(root);
      modifierClick(first);
      modifierClick(second);
      // No popup while the gesture is still open.
      expect(root.querySelector<HTMLElement>(".ag-popup")!.hidden).toBe(true);

      releaseModifiers();
      annotateOpenEditor(root, "Align these");

      const [annotation] = controller.getAnnotations();
      expect(annotation.isMultiSelect).toBe(true);
      expect(annotation.comment).toBe("Align these");
      controller.destroy();
    });

    it("degrades a single remaining target to an ordinary annotation", () => {
      const first = pageDiv("Feature one");
      const controller = mountAgentation(document);
      const root = shadow(controller);

      activate(root);
      modifierClick(first);
      // Clicking the same target again toggles it back out.
      modifierClick(first);
      modifierClick(first);
      releaseModifiers();
      annotateOpenEditor(root, "Just this one");

      const [annotation] = controller.getAnnotations();
      expect(annotation.isMultiSelect).toBeFalsy();
      controller.destroy();
    });

    it("abandons the selection on Escape without opening a popup", () => {
      const first = pageDiv("Feature one");
      const controller = mountAgentation(document);
      const root = shadow(controller);

      activate(root);
      modifierClick(first);
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      releaseModifiers();

      expect(root.querySelector<HTMLElement>(".ag-popup")!.hidden).toBe(true);
      expect(controller.getAnnotations()).toHaveLength(0);
      controller.destroy();
    });
  });
});

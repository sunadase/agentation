import { describe, expect, it, vi } from "vitest";
import { createRuntimeEnvironment } from "../environment";
import { createToolbarRegion } from "./toolbar";
import { DEFAULT_SETTINGS, type RuntimeViewModel, type ViewIntent } from "./model";
import type { Annotation } from "../../types";
import type { AgentationConfig } from "../types";

function annotation(id: string, kind?: Annotation["kind"]): Annotation {
  return { id, comment: "c", timestamp: 1, x: 0, y: 0, ...(kind ? { kind } : {}) } as Annotation;
}

function baseModel(patch: Partial<RuntimeViewModel> = {}): RuntimeViewModel {
  return {
    active: false,
    hidden: false,
    hiding: false,
    entrance: false,
    theme: "dark",
    settings: DEFAULT_SETTINGS,
    toolbarPosition: null,
    dragging: false,
    settingsOpen: false,
    settingsPage: "main",
    tooltipsHidden: false,
    tooltipSession: false,
    annotations: [],
    exitingAnnotationIds: new Set(),
    animatedAnnotationIds: new Set(),
    renumberFrom: null,
    editor: null,
    markersVisible: true,
    markersExiting: false,
    hover: null,
    hoveredAnnotationId: null,
    outlines: [],
    dragSelection: null,
    dragHighlights: [],
    scrolling: false,
    frozen: false,
    layout: {
      active: false,
      exiting: false,
      wireframe: false,
      wireframeReady: false,
      wireframeOpacity: 1,
      wireframePurpose: "",
      activeComponent: null,
      placements: [],
      rearrange: null,
      interacting: false,
    },
    hasEndpoint: false,
    connection: "disconnected",
    sendState: "idle",
    copied: false,
    metadataAdapterIds: [],
    toast: null,
    ...patch,
  };
}

function setup() {
  const intents: ViewIntent[] = [];
  const environment = createRuntimeEnvironment(document);
  const region = createToolbarRegion(environment, (intent) => intents.push(intent));
  document.body.append(region.root);
  return { environment, region, intents };
}

const config: AgentationConfig = {};

describe("toolbar region", () => {
  it("builds the collapsed shell with part and ui markers", () => {
    const { region } = setup();
    expect(region.root.getAttribute("part")).toBe("toolbar");
    expect(region.root.getAttribute("data-agentation-ui")).toBe("toolbar");
    expect(region.root.className).toBe("ag-toolbar");

    region.update(baseModel({ annotations: [annotation("a"), annotation("b")] }), config);
    const container = region.root.querySelector(".ag-toolbar-container")!;
    expect(container.classList.contains("is-collapsed")).toBe(true);
    expect(container.getAttribute("role")).toBe("button");
    const badge = region.root.querySelector(".ag-toolbar-badge") as HTMLElement;
    expect(badge.hidden).toBe(false);
    expect(badge.textContent).toBe("2");
    region.destroy();
  });

  it("renders every original tooltip and shortcut chip in order", () => {
    const { region } = setup();
    region.update(baseModel({ active: true }), config);
    const tooltips = [...region.root.querySelectorAll(".ag-toolbar-button-tooltip")].map(
      (node) => node.textContent,
    );
    expect(tooltips).toEqual([
      "Pause animationsP",
      "Layout modeL",
      // The default model has markers visible, so the toggle offers to hide.
      "Hide markersH",
      "Copy feedbackC",
      "Send AnnotationsS",
      "Clear allX",
      "Settings",
      "ExitEsc",
    ]);
    const shortcuts = [...region.root.querySelectorAll(".ag-toolbar-shortcut")].map(
      (node) => node.textContent,
    );
    expect(shortcuts).toEqual(["P", "L", "H", "C", "S", "X", "Esc"]);
    // The divider sits between Settings and Exit, as in the original.
    const row = [...region.root.querySelector(".ag-toolbar-controls-content")!.children].map(
      (node) => node.className,
    );
    expect(row[6]).toContain("ag-toolbar-button-wrapper");
    expect(row[7]).toBe("ag-toolbar-divider");
    region.destroy();
  });

  it("flips tooltip text, pressed state and keyboard shortcuts with model state", () => {
    const { region } = setup();
    region.update(
      baseModel({
        active: true,
        frozen: true,
        markersVisible: false,
        annotations: [annotation("a")],
      }),
      config,
    );
    const buttons = [...region.root.querySelectorAll("button")];
    expect(buttons.map((b) => b.getAttribute("aria-keyshortcuts"))).toEqual([
      "p",
      "l",
      "h",
      "c",
      "s",
      "x",
      null,
      "Escape",
    ]);
    expect(buttons[0].getAttribute("aria-pressed")).toBe("true");
    expect(buttons[0].getAttribute("aria-label")).toBe("Resume animations");
    expect(region.root.querySelectorAll(".ag-toolbar-tooltip-label")[0].textContent).toBe(
      "Resume animations",
    );
    expect(buttons[2].getAttribute("aria-label")).toBe("Show markers");
    expect(buttons[2].getAttribute("aria-pressed")).toBe("false");
    region.destroy();
  });

  it("applies the oracle's disabled rules", () => {
    const { region } = setup();
    const buttons = () => [...region.root.querySelectorAll("button")];

    region.update(baseModel({ active: true }), config);
    expect(buttons()[2].disabled).toBe(true); // markers, no annotations
    expect(buttons()[3].disabled).toBe(true); // copy
    expect(buttons()[5].disabled).toBe(true); // clear

    region.update(baseModel({ active: true, annotations: [annotation("a")] }), config);
    expect(buttons()[2].disabled).toBe(false);
    expect(buttons()[3].disabled).toBe(false);
    expect(buttons()[5].disabled).toBe(false);

    // Layout mode disables the marker toggle even with annotations.
    region.update(
      baseModel({
        active: true,
        annotations: [annotation("a")],
        layout: { ...baseModel().layout, active: true },
      }),
      config,
    );
    expect(buttons()[2].disabled).toBe(true);

    // Wireframe branch: copy needs layout content, annotations do not count.
    region.update(
      baseModel({
        active: true,
        annotations: [annotation("a")],
        layout: { ...baseModel().layout, active: true, wireframe: true },
      }),
      config,
    );
    expect(buttons()[3].disabled).toBe(true);
    expect(buttons()[3].getAttribute("aria-label")).toBe("Copy layout");
    region.destroy();
  });

  it("gates Send on availability inputs", () => {
    const { region } = setup();
    const send = () => region.root.querySelectorAll("button")[4] as HTMLButtonElement;
    const wrapper = () => region.root.querySelector(".ag-toolbar-send")!;

    region.update(baseModel({ active: true, annotations: [annotation("a")] }), config);
    expect(wrapper().classList.contains("is-send-visible")).toBe(false);
    expect(send().disabled).toBe(true);
    expect(send().tabIndex).toBe(-1);

    region.update(
      baseModel({ active: true, annotations: [annotation("a")], hasEndpoint: true }),
      config,
    );
    expect(wrapper().classList.contains("is-send-visible")).toBe(true);
    expect(send().disabled).toBe(false);

    region.update(baseModel({ active: true, annotations: [annotation("a")] }), {
      webhookUrl: "not a url",
    });
    expect(wrapper().classList.contains("is-send-visible")).toBe(false);

    region.update(baseModel({ active: true, annotations: [annotation("a")] }), {
      webhookUrl: "https://example.com/hook",
    });
    expect(wrapper().classList.contains("is-send-visible")).toBe(true);

    region.update(baseModel({ active: true, annotations: [annotation("a")] }), {
      onSubmit: () => {},
    });
    expect(wrapper().classList.contains("is-send-visible")).toBe(true);

    // Settings webhook overrides config, and `sending` disables the control.
    region.update(
      baseModel({
        active: true,
        annotations: [annotation("a")],
        sendState: "sending",
        settings: { ...DEFAULT_SETTINGS, webhookUrl: "https://example.com/hook" },
      }),
      config,
    );
    expect(wrapper().classList.contains("is-send-visible")).toBe(true);
    expect(send().disabled).toBe(true);
    region.destroy();
  });

  it("counts only visible feedback annotations in the badge", () => {
    const { region } = setup();
    region.update(
      baseModel({
        annotations: [
          annotation("a"),
          annotation("b"),
          annotation("p", "placement"),
          annotation("r", "rearrange"),
        ],
        exitingAnnotationIds: new Set(["b"]),
      }),
      config,
    );
    expect(region.root.querySelector(".ag-toolbar-badge")!.textContent).toBe("1");
    region.destroy();
  });

  it("dispatches hide-tooltips before each control intent", () => {
    const { region, intents } = setup();
    region.update(baseModel({ active: true, annotations: [annotation("a")], hasEndpoint: true }), config);
    for (const button of region.root.querySelectorAll("button")) {
      (button as HTMLButtonElement).click();
    }
    expect(intents).toEqual([
      { type: "tooltips-hidden", hidden: true },
      { type: "toggle-freeze" },
      { type: "tooltips-hidden", hidden: true },
      { type: "toggle-layout" },
      { type: "tooltips-hidden", hidden: true },
      { type: "toggle-markers" },
      { type: "tooltips-hidden", hidden: true },
      { type: "copy" },
      { type: "tooltips-hidden", hidden: true },
      { type: "submit" },
      { type: "tooltips-hidden", hidden: true },
      { type: "clear" },
      { type: "tooltips-hidden", hidden: true },
      { type: "toggle-settings" },
      { type: "tooltips-hidden", hidden: true },
      { type: "deactivate" },
    ]);
    region.destroy();
  });

  it("runs the 850 ms tooltip session on hover", () => {
    vi.useFakeTimers();
    const { region, intents } = setup();
    region.update(baseModel({ active: true }), config);
    const row = region.root.querySelector(".ag-toolbar-controls-content")!;
    row.dispatchEvent(new MouseEvent("mouseenter"));
    vi.advanceTimersByTime(849);
    expect(intents).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(intents).toEqual([{ type: "tooltip-session", active: true }]);
    row.dispatchEvent(new MouseEvent("mouseleave"));
    expect(intents.slice(1)).toEqual([
      { type: "tooltip-session", active: false },
      { type: "tooltips-hidden", hidden: false },
    ]);
    region.destroy();
    vi.useRealTimers();
  });

  it("activates on collapsed click but not right after a drag", () => {
    const { region, intents } = setup();
    region.update(baseModel(), config);
    const container = region.root.querySelector(".ag-toolbar-container") as HTMLElement;

    container.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(intents).toEqual([{ type: "activate" }]);

    intents.length = 0;
    container.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true, clientX: 10, clientY: 20 }),
    );
    document.dispatchEvent(
      new MouseEvent("pointermove", { bubbles: true, clientX: 40, clientY: 60 }),
    );
    region.update(baseModel({ dragging: true }), config);
    document.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
    container.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(intents).toEqual([
      { type: "drag-start", pointerX: 10, pointerY: 20 },
      { type: "drag-move", pointerX: 40, pointerY: 60 },
      { type: "drag-end" },
    ]);

    // Buttons and the settings panel never start a drag.
    intents.length = 0;
    region.update(baseModel({ active: true }), config);
    region.root
      .querySelector("button")!
      .dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(intents).toEqual([]);
    region.destroy();
  });

  it("applies and clears the dragged placement", () => {
    const { region } = setup();
    region.update(baseModel({ toolbarPosition: { x: 12, y: 34 } }), config);
    expect(region.root.style.left).toBe("12px");
    expect(region.root.style.top).toBe("34px");
    expect(region.root.style.right).toBe("auto");
    expect(region.root.style.bottom).toBe("auto");
    region.update(baseModel({ toolbarPosition: null }), config);
    expect(region.root.getAttribute("style")).toBe("");
    region.destroy();
  });

  it("flips tooltip alignment classes from the toolbar position", () => {
    const { region } = setup();
    const controls = () => region.root.querySelector(".ag-toolbar-controls-content")!;
    const first = () => region.root.querySelector(".ag-toolbar-button-wrapper")!;
    const last = () => [...region.root.querySelectorAll(".ag-toolbar-button-wrapper")].at(-1)!;

    region.update(baseModel({ active: true, toolbarPosition: { x: 10, y: 50 } }), config);
    expect(controls().classList.contains("ag-toolbar-tooltip-below")).toBe(true);
    expect(first().classList.contains("ag-toolbar-button-wrapper-align-left")).toBe(true);

    region.update(
      baseModel({ active: true, toolbarPosition: { x: window.innerWidth - 10, y: 500 } }),
      config,
    );
    expect(controls().classList.contains("ag-toolbar-tooltip-below")).toBe(false);
    expect(last().classList.contains("ag-toolbar-button-wrapper-align-right")).toBe(true);
    region.destroy();
  });

  it("shows the MCP dot only while connected and settings are closed", () => {
    const { region } = setup();
    const dot = () => region.root.querySelector(".ag-toolbar-mcp-indicator")!;

    region.update(baseModel({ active: true, hasEndpoint: true, connection: "connecting" }), config);
    expect(dot().classList.contains("is-visible")).toBe(true);
    expect(dot().classList.contains("is-connecting")).toBe(true);
    expect(dot().getAttribute("title")).toBe("MCP Connecting...");

    region.update(
      baseModel({ active: true, hasEndpoint: true, connection: "connected", settingsOpen: true }),
      config,
    );
    expect(dot().classList.contains("is-visible")).toBe(false);
    expect(dot().getAttribute("title")).toBe("MCP Connected");

    region.update(baseModel({ active: true, connection: "connected" }), config);
    expect(dot().classList.contains("is-visible")).toBe(false);
    region.destroy();
  });

  it("reports status through the live region", () => {
    const { region } = setup();
    const status = () => region.root.querySelector(".ag-toolbar-live-status")!;
    expect(status().getAttribute("aria-live")).toBe("polite");

    region.update(baseModel({ copied: true }), config);
    expect(status().textContent).toBe("Copied");
    region.update(baseModel({ sendState: "sent" }), config);
    expect(status().textContent).toBe("Sent");
    region.update(baseModel({ toast: "Clipboard blocked" }), config);
    expect(status().textContent).toBe("Clipboard blocked");
    region.destroy();
  });

  it("never constructs or replaces nodes during update", () => {
    const { region } = setup();
    region.update(baseModel(), config);
    const before = [...region.root.querySelectorAll("*")];
    const observer = new MutationObserver(() => {});
    observer.observe(region.root, { childList: true, subtree: true });

    for (const model of [
      baseModel({ active: true, entrance: true, annotations: [annotation("a")] }),
      baseModel({ active: true, frozen: true, copied: true, hasEndpoint: true }),
      baseModel({
        active: true,
        sendState: "failed",
        layout: { ...baseModel().layout, active: true, wireframe: true },
      }),
      baseModel({ hiding: true, hidden: true, toolbarPosition: { x: 5, y: 5 } }),
    ]) {
      region.update(model, config);
    }

    const records = observer.takeRecords();
    observer.disconnect();
    expect(records.flatMap((r) => [...r.addedNodes])).toEqual([]);
    expect(records.flatMap((r) => [...r.removedNodes])).toEqual([]);
    const after = [...region.root.querySelectorAll("*")];
    expect(after).toEqual(before);
    region.destroy();
  });

  it("stops listening and clears its timer on destroy", () => {
    vi.useFakeTimers();
    const { region, intents } = setup();
    region.update(baseModel({ active: true }), config);
    region.root
      .querySelector(".ag-toolbar-controls-content")!
      .dispatchEvent(new MouseEvent("mouseenter"));
    region.destroy();
    vi.advanceTimersByTime(2000);
    region.root.querySelector("button")!.click();
    document.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
    expect(intents).toEqual([]);
    vi.useRealTimers();
  });
});

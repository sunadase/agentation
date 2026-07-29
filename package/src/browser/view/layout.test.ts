import { afterEach, describe, expect, it, vi } from "vitest";
import { createRuntimeEnvironment } from "../environment";
import { createLayoutRegion } from "./layout";
import { DEFAULT_SETTINGS, type RuntimeViewModel, type ViewIntent } from "./model";
import { COMPONENT_REGISTRY, DEFAULT_SIZES, type DesignPlacement, type DetectedSection } from "../layout/types";
import { MIN_SIZE } from "../layout/geometry";
import type { AgentationConfig } from "../types";

const config: AgentationConfig = {};

function placement(patch: Partial<DesignPlacement> = {}): DesignPlacement {
  return {
    id: "p1",
    type: "card",
    x: 100,
    y: 200,
    width: 280,
    height: 240,
    scrollY: 0,
    timestamp: 1,
    ...patch,
  };
}

function section(patch: Partial<DetectedSection> = {}): DetectedSection {
  const rect = { x: 10, y: 20, width: 300, height: 150 };
  return {
    id: "s1",
    label: "Main",
    tagName: "main",
    selector: "main",
    role: null,
    className: null,
    textSnippet: null,
    originalRect: { ...rect },
    currentRect: { ...rect },
    originalIndex: 0,
    ...patch,
  };
}

function baseModel(patch: Partial<RuntimeViewModel> = {}): RuntimeViewModel {
  return {
    active: true,
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
      active: true,
      exiting: false,
      wireframe: false,
      wireframeReady: false,
      wireframeOpacity: 1,
      wireframePurpose: "",
      activeComponent: null,
      placements: [],
      rearrange: null,
      interacting: false,
      ...patch.layout,
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

/** Regions and page stand-ins created by a test, torn down after it. */
const created: { destroy(): void }[] = [];

afterEach(() => {
  for (const region of created) region.destroy();
  created.length = 0;
  document.body.replaceChildren();
  vi.useRealTimers();
});

function setup() {
  const intents: ViewIntent[] = [];
  const environment = createRuntimeEnvironment(document);
  const region = createLayoutRegion(environment, (intent) => intents.push(intent));
  document.body.append(region.root);
  created.push(region);
  return { environment, region, intents };
}

/**
 * A captured section only renders while its page element is still there, so
 * tests that exercise the rearrange overlay have to provide one.
 */
function pageSection(rect: { x: number; y: number; width: number; height: number }): HTMLElement {
  const element = document.createElement("main");
  element.getBoundingClientRect = () =>
    ({
      ...rect,
      top: rect.y,
      left: rect.x,
      right: rect.x + rect.width,
      bottom: rect.y + rect.height,
    }) as DOMRect;
  document.body.append(element);
  return element;
}

/**
 * jsdom has no `PointerEvent`, so synthesise one: the region only reads
 * `button`, `isPrimary`, the client coordinates and the modifier flags.
 */
function pointer(
  type: string,
  init: MouseEventInit = {},
): MouseEvent {
  const event = new MouseEvent(type, { bubbles: true, composed: true, button: 0, ...init });
  Object.defineProperty(event, "isPrimary", { value: true });
  return event;
}

function key(name: string, init: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent("keydown", { bubbles: true, composed: true, key: name, ...init });
}

function intentsOf<T extends ViewIntent["type"]>(
  intents: readonly ViewIntent[],
  type: T,
): Extract<ViewIntent, { type: T }>[] {
  return intents.filter((intent): intent is Extract<ViewIntent, { type: T }> => intent.type === type);
}

describe("layout region", () => {
  it("builds the palette from the full component registry", () => {
    const { region } = setup();
    region.update(baseModel(), config);

    expect(region.root.getAttribute("data-agentation-ui")).toBe("");
    const items = region.root.querySelectorAll("button[data-component]");
    const total = COMPONENT_REGISTRY.reduce((sum, group) => sum + group.items.length, 0);
    expect(items).toHaveLength(total);
    expect(region.root.querySelectorAll(".ag-layout-palette-section-title")).toHaveLength(
      COMPONENT_REGISTRY.length,
    );
    // Each item carries its label, and a glyph built without innerHTML.
    const first = items[0] as HTMLElement;
    expect(first.querySelector(".ag-layout-item-label")?.textContent).toBe("Navigation");
    expect(first.querySelector("svg rect")).toBeTruthy();
  });

  it("arms and disarms a component from the palette", () => {
    const { region, intents } = setup();
    region.update(baseModel(), config);

    const card = region.root.querySelector<HTMLButtonElement>('button[data-component="card"]');
    card?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(intents).toContainEqual({ type: "layout-select-component", component: "card" });

    region.update(baseModel({ layout: { ...baseModel().layout, activeComponent: "card" } }), config);
    expect(card?.getAttribute("aria-pressed")).toBe("true");

    card?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(intents).toContainEqual({ type: "layout-select-component", component: null });
  });

  it("reports the wireframe toggle and its purpose field", () => {
    const { region, intents } = setup();
    region.update(baseModel(), config);

    const toggle = region.root.querySelector<HTMLButtonElement>(".ag-layout-canvas-toggle");
    toggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(intents).toContainEqual({ type: "layout-wireframe", enabled: true });

    region.update(baseModel({ layout: { ...baseModel().layout, wireframe: true } }), config);
    const purpose = region.root.querySelector<HTMLTextAreaElement>(".ag-layout-purpose-input");
    expect(purpose?.disabled).toBe(false);
    // A real label, bound to the field.
    expect(region.root.querySelector<HTMLLabelElement>("label[for='ag-layout-purpose']")).toBeTruthy();

    purpose!.value = "Pricing page";
    purpose!.dispatchEvent(new Event("input", { bubbles: true }));
    expect(intents).toContainEqual({ type: "layout-wireframe-purpose", purpose: "Pricing page" });
  });

  it("shows the footer count only when there is content and clears after the exit", () => {
    vi.useFakeTimers();
    const { region, intents } = setup();
    region.update(baseModel(), config);
    const wrap = region.root.querySelector<HTMLElement>(".ag-layout-footer-wrap");
    expect(wrap?.hidden).toBe(true);

    region.update(
      baseModel({ layout: { ...baseModel().layout, placements: [placement()] } }),
      config,
    );
    expect(wrap?.hidden).toBe(false);
    expect(region.root.querySelector(".ag-layout-footer-count")?.textContent).toContain("1 Change");

    region.root
      .querySelector<HTMLButtonElement>(".ag-layout-footer-clear")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(intentsOf(intents, "layout-clear")).toHaveLength(0);
    vi.advanceTimersByTime(200);
    expect(intentsOf(intents, "layout-clear")).toHaveLength(1);
  });

  it("pools placement and section nodes by id", () => {
    pageSection({ x: 10, y: 20, width: 300, height: 150 });
    const { region } = setup();
    const model = baseModel({
      layout: {
        ...baseModel().layout,
        placements: [placement(), placement({ id: "p2", x: 400 })],
        rearrange: { sections: [section()], originalOrder: ["s1"], detectedAt: 1 },
      },
    });
    region.update(model, config);

    const first = region.root.querySelector('[data-design-placement="p1"]');
    const captured = region.root.querySelector('[data-rearrange-section="s1"]');
    expect(first).toBeTruthy();
    expect(captured).toBeTruthy();

    // Moving one placement must not replace either node.
    region.update(
      baseModel({
        layout: {
          ...model.layout,
          placements: [placement({ x: 150 }), placement({ id: "p2", x: 400 })],
        },
      }),
      config,
    );
    expect(region.root.querySelector('[data-design-placement="p1"]')).toBe(first);
    expect(region.root.querySelector('[data-rearrange-section="s1"]')).toBe(captured);
    expect((first as HTMLElement).style.left).toBe("150px");

    // Dropping p2 removes only its node.
    region.update(baseModel({ layout: { ...model.layout, placements: [placement()] } }), config);
    expect(region.root.querySelector('[data-design-placement="p2"]')).toBeNull();
    expect(region.root.querySelector('[data-design-placement="p1"]')).toBe(first);
  });

  it("nudges by 1px, 20px with shift, and clamps at zero", () => {
    const { region, intents } = setup();
    region.update(
      baseModel({ layout: { ...baseModel().layout, placements: [placement({ x: 10, y: 5 })] } }),
      config,
    );

    const node = region.root.querySelector<HTMLElement>('[data-design-placement="p1"]');
    node?.dispatchEvent(pointer("pointerdown"));
    document.dispatchEvent(pointer("pointerup"));

    document.body.dispatchEvent(key("ArrowRight"));
    let changes = intentsOf(intents, "placements-change");
    expect(changes.at(-1)?.placements[0]).toMatchObject({ x: 11, y: 5 });

    document.body.dispatchEvent(key("ArrowDown", { shiftKey: true }));
    changes = intentsOf(intents, "placements-change");
    expect(changes.at(-1)?.placements[0]).toMatchObject({ x: 11, y: 25 });

    // Clamped: 11 - 20 and 5 - 20 would both be negative.
    document.body.dispatchEvent(key("ArrowLeft", { shiftKey: true }));
    document.body.dispatchEvent(key("ArrowUp", { shiftKey: true }));
    document.body.dispatchEvent(key("ArrowUp", { shiftKey: true }));
    changes = intentsOf(intents, "placements-change");
    expect(changes.at(-1)?.placements[0]).toMatchObject({ x: 0, y: 0 });
  });

  it("deletes the selection after the 180ms exit", () => {
    vi.useFakeTimers();
    pageSection({ x: 10, y: 20, width: 300, height: 150 });
    const { region, intents } = setup();
    region.update(
      baseModel({
        layout: {
          ...baseModel().layout,
          placements: [placement()],
          rearrange: { sections: [section()], originalOrder: ["s1"], detectedAt: 1 },
        },
      }),
      config,
    );

    region.root
      .querySelector<HTMLElement>('[data-design-placement="p1"]')
      ?.dispatchEvent(pointer("pointerdown"));
    document.dispatchEvent(pointer("pointerup"));
    document.body.dispatchEvent(key("Delete"));

    const node = region.root.querySelector<HTMLElement>('[data-design-placement="p1"]');
    expect(node?.classList.contains("is-exiting")).toBe(true);
    expect(intentsOf(intents, "placement-delete")).toHaveLength(0);

    vi.advanceTimersByTime(180);
    expect(intentsOf(intents, "placement-delete")).toEqual([{ type: "placement-delete", id: "p1" }]);
  });

  it("places the armed component at its default size on a click", () => {
    const { region, intents } = setup();
    region.update(
      baseModel({ layout: { ...baseModel().layout, activeComponent: "button" } }),
      config,
    );

    const layer = region.root.querySelector<HTMLElement>(".ag-layout-overlay");
    layer?.dispatchEvent(pointer("pointerdown", { clientX: 300, clientY: 400 }));
    document.dispatchEvent(pointer("pointerup", { clientX: 300, clientY: 400 }));

    const created = intentsOf(intents, "placements-change").at(-1)?.placements ?? [];
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      type: "button",
      width: DEFAULT_SIZES.button.width,
      height: DEFAULT_SIZES.button.height,
      x: 300 - DEFAULT_SIZES.button.width / 2,
      y: 400 - DEFAULT_SIZES.button.height / 2,
    });
    expect(intentsOf(intents, "placement-sync")).toHaveLength(1);
    expect(intents).toContainEqual({ type: "layout-select-component", component: null });
    expect(intentsOf(intents, "layout-interacting").map((intent) => intent.interacting)).toEqual([
      true,
      false,
    ]);
  });

  it("drag-places a custom size and honours MIN_SIZE", () => {
    const { region, intents } = setup();
    region.update(baseModel({ layout: { ...baseModel().layout, activeComponent: "card" } }), config);

    const layer = region.root.querySelector<HTMLElement>(".ag-layout-overlay");
    layer?.dispatchEvent(pointer("pointerdown", { clientX: 100, clientY: 100 }));
    document.dispatchEvent(pointer("pointermove", { clientX: 110, clientY: 108 }));
    const draw = region.root.querySelector<HTMLElement>(".ag-layout-draw-box");
    expect(draw?.hidden).toBe(false);
    expect(region.root.querySelector<HTMLElement>(".ag-layout-size-indicator")?.textContent).toBe(
      "10 × 8",
    );
    document.dispatchEvent(pointer("pointerup", { clientX: 110, clientY: 108 }));

    const created = intentsOf(intents, "placements-change").at(-1)?.placements ?? [];
    expect(created[0]).toMatchObject({ x: 100, y: 100, width: MIN_SIZE, height: MIN_SIZE });
    expect(draw?.hidden).toBe(true);
  });

  it("drags a component out of the palette and reports the drop", () => {
    const { region, intents } = setup();
    region.update(baseModel(), config);

    const item = region.root.querySelector<HTMLButtonElement>('button[data-component="hero"]');
    item?.dispatchEvent(pointer("pointerdown", { clientX: 1000, clientY: 800 }));
    const preview = region.root.querySelector<HTMLElement>(".ag-layout-drag-preview");
    expect(preview?.hidden).toBe(true);

    document.dispatchEvent(pointer("pointermove", { clientX: 600, clientY: 400 }));
    // The preview belongs to this region's tree, never to the page body.
    expect(preview?.hidden).toBe(false);
    expect(preview?.parentElement).toBe(region.root);

    document.dispatchEvent(pointer("pointerup", { clientX: 600, clientY: 400 }));
    expect(intents).toContainEqual({
      type: "layout-drop-component",
      component: "hero",
      clientX: 600,
      clientY: 400,
    });
    expect(preview?.hidden).toBe(true);
  });

  it("clears the other overlay's selection unless shift is held", () => {
    pageSection({ x: 10, y: 20, width: 300, height: 150 });
    const { region } = setup();
    region.update(
      baseModel({
        layout: {
          ...baseModel().layout,
          placements: [placement()],
          rearrange: { sections: [section()], originalOrder: ["s1"], detectedAt: 1 },
        },
      }),
      config,
    );

    const placementNode = region.root.querySelector<HTMLElement>('[data-design-placement="p1"]');
    const sectionNode = region.root.querySelector<HTMLElement>('[data-rearrange-section="s1"]');

    placementNode?.dispatchEvent(pointer("pointerdown"));
    document.dispatchEvent(pointer("pointerup"));
    expect(placementNode?.classList.contains("is-selected")).toBe(true);

    // Shift keeps the placement selected across overlays.
    sectionNode?.dispatchEvent(pointer("pointerdown", { shiftKey: true }));
    document.dispatchEvent(pointer("pointerup"));
    expect(placementNode?.classList.contains("is-selected")).toBe(true);
    expect(sectionNode?.classList.contains("is-selected")).toBe(true);

    // A plain click on the section drops the placement.
    sectionNode?.dispatchEvent(pointer("pointerdown"));
    document.dispatchEvent(pointer("pointerup"));
    expect(placementNode?.classList.contains("is-selected")).toBe(false);
    expect(sectionNode?.classList.contains("is-selected")).toBe(true);
  });

  it("moves a mixed selection by one identical snapped delta", () => {
    const rect = { x: 500, y: 700, width: 100, height: 50 };
    pageSection(rect);
    const { region, intents } = setup();
    region.update(
      baseModel({
        layout: {
          ...baseModel().layout,
          placements: [placement({ x: 500, y: 500 })],
          rearrange: {
            sections: [section({ originalRect: { ...rect }, currentRect: { ...rect } })],
            originalOrder: ["s1"],
            detectedAt: 1,
          },
        },
      }),
      config,
    );

    const placementNode = region.root.querySelector<HTMLElement>('[data-design-placement="p1"]');
    const sectionNode = region.root.querySelector<HTMLElement>('[data-rearrange-section="s1"]');
    placementNode?.dispatchEvent(pointer("pointerdown", { clientX: 0, clientY: 0 }));
    document.dispatchEvent(pointer("pointerup"));
    sectionNode?.dispatchEvent(pointer("pointerdown", { clientX: 0, clientY: 0, shiftKey: true }));

    document.dispatchEvent(pointer("pointermove", { clientX: 40, clientY: 60 }));
    // Sections translate during the drag; placements commit live.
    expect(sectionNode?.style.transform).toBe("translate(40px, 60px)");
    expect(intentsOf(intents, "placements-change").at(-1)?.placements[0]).toMatchObject({
      x: 540,
      y: 560,
    });

    document.dispatchEvent(pointer("pointerup", { clientX: 40, clientY: 60 }));
    const state = intentsOf(intents, "rearrange-change").at(-1)?.state;
    expect(state?.sections[0].currentRect).toMatchObject({ x: 540, y: 760 });
    expect(sectionNode?.style.transform).toBe("");
    expect(intentsOf(intents, "rearrange-sync")).toHaveLength(1);
  });

  it("duplicates the dragged placements exactly once per alt gesture", () => {
    const { region, intents } = setup();
    region.update(
      baseModel({ layout: { ...baseModel().layout, placements: [placement({ x: 500, y: 500 })] } }),
      config,
    );

    region.root
      .querySelector<HTMLElement>('[data-design-placement="p1"]')
      ?.dispatchEvent(pointer("pointerdown", { clientX: 0, clientY: 0 }));
    document.dispatchEvent(pointer("pointermove", { clientX: 30, clientY: 30, altKey: true }));
    document.dispatchEvent(pointer("pointermove", { clientX: 60, clientY: 60, altKey: true }));
    document.dispatchEvent(pointer("pointerup", { clientX: 60, clientY: 60 }));

    expect(intentsOf(intents, "placements-change").at(-1)?.placements).toHaveLength(2);
  });

  it("resizes a placement from a handle with a live readout", () => {
    const { region, intents } = setup();
    region.update(
      baseModel({
        layout: {
          ...baseModel().layout,
          placements: [placement({ x: 500, y: 500, width: 200, height: 100 })],
        },
      }),
      config,
    );

    const handle = region.root.querySelector<HTMLElement>(
      '[data-design-placement="p1"] [data-direction="se"]',
    );
    expect(region.root.querySelectorAll('[data-design-placement="p1"] [data-direction]')).toHaveLength(
      8,
    );
    handle?.dispatchEvent(pointer("pointerdown", { clientX: 700, clientY: 600 }));
    document.dispatchEvent(pointer("pointermove", { clientX: 760, clientY: 640 }));
    expect(region.root.querySelector(".ag-layout-size-indicator")?.textContent).toBe("260 × 140");
    document.dispatchEvent(pointer("pointerup", { clientX: 760, clientY: 640 }));

    expect(intentsOf(intents, "placements-change").at(-1)?.placements[0]).toMatchObject({
      width: 260,
      height: 140,
    });
    expect(intentsOf(intents, "placement-sync")).toHaveLength(1);
  });

  it("edits placement text on double-click for text-capable components only", () => {
    const { region, intents } = setup();
    region.update(
      baseModel({ layout: { ...baseModel().layout, placements: [placement({ type: "divider" })] } }),
      config,
    );
    const editor = region.root.querySelector<HTMLElement>(".ag-layout-editor");
    region.root
      .querySelector<HTMLElement>('[data-design-placement="p1"]')
      ?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(editor?.hidden).toBe(true);

    region.update(
      baseModel({ layout: { ...baseModel().layout, placements: [placement({ type: "button" })] } }),
      config,
    );
    region.root
      .querySelector<HTMLElement>('[data-design-placement="p1"]')
      ?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(editor?.hidden).toBe(false);
    expect(editor?.getAttribute("role")).toBe("dialog");
    const input = region.root.querySelector<HTMLTextAreaElement>(".ag-layout-editor-textarea");
    expect(input?.placeholder).toBe("Button label");
    expect(region.root.querySelector(".ag-layout-editor-submit")?.textContent).toBe("Set");

    input!.value = "  Buy now  ";
    input!.dispatchEvent(key("Enter"));
    expect(intentsOf(intents, "placements-change").at(-1)?.placements[0].text).toBe("Buy now");
  });

  it("removes a captured section from its delete control", () => {
    vi.useFakeTimers();
    pageSection({ x: 10, y: 20, width: 300, height: 150 });
    const { region, intents } = setup();
    region.update(
      baseModel({
        layout: {
          ...baseModel().layout,
          rearrange: { sections: [section()], originalOrder: ["s1"], detectedAt: 1 },
        },
      }),
      config,
    );

    region.root
      .querySelector<HTMLButtonElement>('[data-delete-section="s1"]')
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    vi.advanceTimersByTime(180);
    expect(intentsOf(intents, "rearrange-delete")).toEqual([{ type: "rearrange-delete", id: "s1" }]);
  });

  it("marks a moved section as a ghost and draws its connector", () => {
    pageSection({ x: 10, y: 20, width: 300, height: 150 });
    const { region } = setup();
    region.update(
      baseModel({
        layout: {
          ...baseModel().layout,
          rearrange: {
            sections: [
              section({
                originalRect: { x: 10, y: 20, width: 300, height: 150 },
                currentRect: { x: 400, y: 500, width: 300, height: 150 },
              }),
            ],
            originalOrder: ["s1"],
            detectedAt: 1,
          },
        },
      }),
      config,
    );

    const node = region.root.querySelector<HTMLElement>('[data-rearrange-section="s1"]');
    expect(node?.classList.contains("is-ghost")).toBe(true);
    expect(node?.querySelector(".ag-layout-ghost-badge")?.textContent).toContain("Suggested Move");
    const connectors = region.root.querySelector<SVGSVGElement>(".ag-layout-connectors");
    expect(connectors?.hasAttribute("hidden")).toBe(false);
    expect(connectors?.querySelector("path")?.getAttribute("d")).toMatch(/^M 160 95 Q/);
  });

  it("captures a page element on click and reports the new section", () => {
    const target = document.createElement("section");
    target.textContent = "hello";
    target.getBoundingClientRect = () =>
      ({ x: 5, y: 15, width: 400, height: 200, top: 15, left: 5, right: 405, bottom: 215 }) as DOMRect;
    document.body.append(target);

    const { region, intents } = setup();
    region.update(
      baseModel({
        layout: {
          ...baseModel().layout,
          rearrange: { sections: [], originalOrder: [], detectedAt: 1 },
        },
      }),
      config,
    );

    target.dispatchEvent(pointer("pointerdown", { clientX: 100, clientY: 100 }));
    const change = intentsOf(intents, "rearrange-change").at(-1)?.state;
    expect(change?.sections).toHaveLength(1);
    expect(change?.sections[0].currentRect).toMatchObject({ x: 5, width: 400, height: 200 });
    expect(intentsOf(intents, "rearrange-sync")).toHaveLength(1);
    document.dispatchEvent(pointer("pointerup"));
  });

  it("ignores clicks that originate inside Agentation UI", () => {
    const { region, intents } = setup();
    region.update(
      baseModel({
        layout: {
          ...baseModel().layout,
          rearrange: { sections: [], originalOrder: [], detectedAt: 1 },
        },
      }),
      config,
    );

    region.root
      .querySelector<HTMLButtonElement>('button[data-component="card"]')
      ?.dispatchEvent(pointer("pointerdown", { clientX: 10, clientY: 10 }));
    document.dispatchEvent(pointer("pointerup"));
    expect(intentsOf(intents, "rearrange-change")).toHaveLength(0);
  });

  it("stops listening and detaches on destroy", () => {
    const { region, intents } = setup();
    region.update(
      baseModel({ layout: { ...baseModel().layout, placements: [placement()] } }),
      config,
    );
    region.destroy();

    expect(region.root.parentElement).toBeNull();
    const before = intents.length;
    document.body.dispatchEvent(key("ArrowRight"));
    expect(intents).toHaveLength(before);
  });
});

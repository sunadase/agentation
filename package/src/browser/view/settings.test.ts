import { afterEach, describe, expect, it } from "vitest";
import { createRuntimeEnvironment } from "../environment";
import { createSettingsRegion } from "./settings";
import {
  ACCENT_OPTIONS,
  DEFAULT_SETTINGS,
  type RuntimeViewModel,
  type ViewIntent,
  type ViewRegion,
} from "./model";
import type { AgentationConfig } from "../types";

function baseModel(patch: Partial<RuntimeViewModel>): RuntimeViewModel {
  return {
    active: true,
    hidden: false,
    hiding: false,
    entrance: false,
    theme: "dark",
    settings: DEFAULT_SETTINGS,
    toolbarPosition: null,
    dragging: false,
    settingsOpen: true,
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

const config: AgentationConfig = {};

const live: ViewRegion[] = [];

afterEach(() => {
  for (const region of live.splice(0)) region.destroy();
  document.body.replaceChildren();
});

function setup(initial: Partial<RuntimeViewModel> = {}) {
  const intents: ViewIntent[] = [];
  const environment = createRuntimeEnvironment(document);
  const region = createSettingsRegion(environment, (intent) =>
    intents.push(intent),
  );
  live.push(region);
  document.body.append(region.root);

  let state = initial;
  const render = (patch: Partial<RuntimeViewModel> = {}): void => {
    state = { ...state, ...patch };
    region.update(baseModel(state), config);
  };
  render();

  return { region, intents, root: region.root, render };
}

function query<T extends Element>(root: Element, selector: string): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`missing ${selector}`);
  return node;
}

/** The visually hidden description a help trigger points `aria-describedby` at. */
function helpText(scope: Element): string {
  const trigger = query(scope, ".ag-settings-help");
  const id = trigger.getAttribute("aria-describedby") ?? "";
  return query(scope, `#${id}`).textContent ?? "";
}

describe("settings region", () => {
  it("marks the root so the toolbar's drag handler can ignore it", () => {
    const { root } = setup();

    expect(root.getAttribute("data-agentation-ui")).toBe("settings");
    expect(root.hasAttribute("data-agentation-settings-panel")).toBe(true);

    const panel = query(root, ".ag-settings-panel");
    expect(panel.getAttribute("role")).toBe("dialog");
    expect(panel.getAttribute("aria-label")).toBe("Agentation settings");
    expect(
      query(root, ".ag-settings-cycle").closest(
        "[data-agentation-settings-panel]",
      ),
    ).toBe(root);
  });

  it("renders the wordmark, version and an accessible brand link", () => {
    const { root } = setup();

    const brand = query<HTMLAnchorElement>(root, ".ag-settings-brand");
    expect(brand.href).toBe("https://agentation.com/");
    expect(brand.target).toBe("_blank");
    expect(brand.rel).toBe("noopener noreferrer");
    expect(brand.textContent).toContain("Agentation");

    const wordmark = query(brand, "svg");
    expect(wordmark.getAttribute("viewBox")).toBe("0 0 676 151");
    expect(query(wordmark, "path").getAttribute("d")).toMatch(
      /^M79\.6666 100\.561L104\.863 15\.5213/,
    );

    expect(query(root, ".ag-settings-version").textContent).toBe("vtest");
  });

  it("never names a framework in the rendered settings UI", () => {
    const { root } = setup({ metadataAdapterIds: ["react"] });

    expect(query(root, ".ag-settings-label").textContent).toContain(
      "Output Detail",
    );
    const rows = root.querySelectorAll(".ag-settings-row-margin-top");
    expect(rows[0].textContent).toContain("Component Metadata");

    // Adapter ids are runtime data; the panel's own copy names no framework.
    const chrome: string[] = [];
    for (const element of root.querySelectorAll("*")) {
      if (element.classList.contains("ag-visually-hidden")) continue;
      for (const attribute of element.attributes) chrome.push(attribute.value);
      for (const child of element.childNodes) {
        if (child.nodeType === 3) chrome.push(child.nodeValue ?? "");
      }
    }
    expect(chrome.filter((value) => value.includes("React"))).toEqual([]);
  });

  it("cycles Output Detail through every option and back to the start", () => {
    const { root, intents, render } = setup();

    const button = query<HTMLButtonElement>(root, ".ag-settings-cycle");
    const label = () =>
      Array.from(
        root.querySelectorAll<HTMLElement>(".ag-settings-cycle-text"),
      ).find((slot) => !slot.hidden)?.textContent;
    const activeDots = () =>
      root.querySelectorAll(".ag-settings-cycle-dot.is-active").length;

    expect(label()).toBe("Standard");
    expect(root.querySelectorAll(".ag-settings-cycle-dot")).toHaveLength(4);
    expect(activeDots()).toBe(1);

    let settings = DEFAULT_SETTINGS;
    const seen: (string | undefined)[] = [];
    for (let step = 0; step < 4; step += 1) {
      button.click();
      const intent = intents.at(-1);
      if (intent?.type !== "settings-change") throw new Error("no patch");
      settings = { ...settings, ...intent.patch };
      render({ settings });
      seen.push(label());
    }

    expect(seen).toEqual(["Detailed", "Forensic", "Compact", "Standard"]);
    expect(settings.outputDetail).toBe(DEFAULT_SETTINGS.outputDetail);
    expect(activeDots()).toBe(1);
  });

  it("describes and disables Component Metadata by adapter availability", () => {
    const { root, intents, render } = setup();
    const row = query(root, ".ag-settings-row-margin-top");
    const input = query<HTMLInputElement>(root, "#agentation-metadata-enabled");

    expect(query(root, "label[for='agentation-metadata-enabled']").textContent)
      .toBe("Component Metadata");
    expect(row.classList.contains("ag-settings-row-disabled")).toBe(true);
    expect(input.disabled).toBe(true);
    expect(input.checked).toBe(false);
    expect(helpText(row)).toBe(
      "No metadata adapters are configured for this page.",
    );

    render({ metadataAdapterIds: ["react", "solid"] });
    expect(row.classList.contains("ag-settings-row-disabled")).toBe(false);
    expect(input.disabled).toBe(false);
    expect(input.checked).toBe(true);
    expect(helpText(row)).toBe(
      "Include component metadata from: react, solid",
    );

    input.checked = false;
    input.dispatchEvent(new Event("change"));
    expect(intents).toEqual([
      { type: "settings-change", patch: { metadataEnabled: false } },
    ]);
  });

  it("treats Hide Until Restart as an action, not a setting", () => {
    const { root, intents } = setup();
    const input = query<HTMLInputElement>(
      root,
      "#agentation-hide-until-restart",
    );

    expect(input.checked).toBe(false);
    input.checked = true;
    input.dispatchEvent(new Event("change"));

    expect(intents).toEqual([{ type: "hide-until-restart" }]);
    expect(input.checked).toBe(false);
  });

  it("renders the seven accents and reports the chosen one", () => {
    const { root, intents } = setup();
    const swatches = root.querySelectorAll<HTMLButtonElement>(
      ".ag-settings-color-option",
    );

    expect(swatches).toHaveLength(ACCENT_OPTIONS.length);
    expect(Array.from(swatches, (node) => node.title)).toEqual(
      ACCENT_OPTIONS.map((accent) => accent.label),
    );
    expect(swatches[1].style.getPropertyValue("--swatch")).toBe(
      ACCENT_OPTIONS[1].srgb,
    );
    expect(swatches[1].style.getPropertyValue("--swatch-p3")).toBe(
      ACCENT_OPTIONS[1].p3,
    );
    // `blue` is the default accent and sits second in the original order.
    expect(swatches[1].classList.contains("is-selected")).toBe(true);
    expect(swatches[1].getAttribute("aria-pressed")).toBe("true");
    expect(swatches[0].getAttribute("aria-pressed")).toBe("false");

    swatches[6].click();
    expect(intents).toEqual([
      { type: "settings-change", patch: { annotationColorId: "red" } },
    ]);
  });

  it("binds both checkbox fields to their labels and settings", () => {
    const { root, intents } = setup({
      settings: { ...DEFAULT_SETTINGS, autoClearAfterCopy: true },
    });

    const autoClear = query<HTMLInputElement>(root, "#agentation-auto-clear");
    const block = query<HTMLInputElement>(
      root,
      "#agentation-block-interactions",
    );
    expect(autoClear.checked).toBe(true);
    expect(block.checked).toBe(DEFAULT_SETTINGS.blockInteractions);
    expect(query(root, "label[for='agentation-auto-clear']").textContent).toBe(
      "Clear on copy/send",
    );
    expect(
      query(root, "label[for='agentation-block-interactions']").textContent,
    ).toBe("Block page interactions");
    expect(helpText(query(root, ".ag-settings-checkbox-field"))).toBe(
      "Automatically clear annotations after copying",
    );

    block.checked = false;
    block.dispatchEvent(new Event("change"));
    expect(intents).toEqual([
      { type: "settings-change", patch: { blockInteractions: false } },
    ]);
  });

  it("slides between the two pages and reports the requested one", () => {
    const { root, intents, render } = setup();
    const main = query(root, ".ag-settings-page");
    const automations = query(root, ".ag-settings-automations-page");
    const nav = query<HTMLButtonElement>(root, ".ag-settings-nav-link");

    expect(nav.getAttribute("aria-expanded")).toBe("false");
    expect(main.classList.contains("ag-settings-slide-left")).toBe(false);
    expect(automations.classList.contains("ag-settings-slide-in")).toBe(false);
    expect(nav.textContent).toContain("Manage MCP & Webhooks");

    nav.click();
    expect(intents).toEqual([{ type: "settings-page", page: "automations" }]);

    render({ settingsPage: "automations" });
    expect(nav.getAttribute("aria-expanded")).toBe("true");
    expect(main.classList.contains("ag-settings-slide-left")).toBe(true);
    expect(automations.classList.contains("ag-settings-slide-in")).toBe(true);

    query<HTMLButtonElement>(root, ".ag-settings-back-button").click();
    expect(intents.at(-1)).toEqual({ type: "settings-page", page: "main" });
  });

  it("shows MCP status only when an endpoint is configured", () => {
    const { root, render } = setup();
    const dot = query<HTMLElement>(root, ".ag-settings-mcp-status-dot");
    const navDot = query<HTMLElement>(root, ".ag-settings-mcp-nav-indicator");

    expect(dot.hidden).toBe(true);
    expect(navDot.hidden).toBe(true);
    expect(query<HTMLAnchorElement>(root, ".ag-settings-learn-more").href).toBe(
      "https://agentation.dev/mcp",
    );

    // An endpoint that has not connected still shows its dot on the automations
    // page, but the nav link stays quiet — exactly as the original.
    render({ hasEndpoint: true });
    expect(dot.hidden).toBe(false);
    expect(dot.classList.contains("is-disconnected")).toBe(true);
    expect(dot.title).toBe("Disconnected");
    expect(navDot.hidden).toBe(true);

    render({ connection: "connecting" });
    expect(dot.title).toBe("Connecting...");
    expect(navDot.hidden).toBe(false);
    expect(navDot.classList.contains("is-connecting")).toBe(true);

    render({ connection: "connected" });
    expect(dot.title).toBe("Connected");
    expect(dot.classList.contains("is-connected")).toBe(true);
    expect(navDot.classList.contains("is-connected")).toBe(true);
  });

  it("validates the webhook URL inline without clobbering the caret", () => {
    const { root, intents, render } = setup();
    const input = query<HTMLInputElement>(root, "#agentation-webhook-url");
    const error = query<HTMLElement>(root, ".ag-settings-webhook-error");
    const autoSendLabel = query(root, ".ag-settings-auto-send-label");
    const autoSend = query<HTMLInputElement>(root, "#agentation-auto-send");

    expect(query(root, "label[for='agentation-webhook-url']").textContent).toBe(
      "Webhook URL",
    );
    expect(input.type).toBe("url");
    expect(input.placeholder).toBe("Webhook URL");
    expect(error.hidden).toBe(true);
    expect(input.getAttribute("aria-invalid")).toBe("false");
    // The original disabled Auto-Send until a URL was present.
    expect(autoSend.disabled).toBe(true);
    expect(autoSendLabel.classList.contains("is-disabled")).toBe(true);

    input.value = "not-a-url";
    input.dispatchEvent(new Event("input"));
    expect(intents).toEqual([
      { type: "settings-change", patch: { webhookUrl: "not-a-url" } },
    ]);

    render({ settings: { ...DEFAULT_SETTINGS, webhookUrl: "not-a-url" } });
    expect(error.hidden).toBe(false);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.value).toBe("not-a-url");
    expect(autoSend.disabled).toBe(false);
    expect(autoSendLabel.classList.contains("is-disabled")).toBe(false);
    expect(autoSendLabel.classList.contains("is-active")).toBe(true);

    // http(s) only: a well-formed URL on another scheme stays invalid.
    render({
      settings: { ...DEFAULT_SETTINGS, webhookUrl: "ftp://example.com/hook" },
    });
    expect(error.hidden).toBe(false);

    render({
      settings: { ...DEFAULT_SETTINGS, webhookUrl: "https://example.com/hook" },
    });
    expect(error.hidden).toBe(true);
    expect(input.value).toBe("https://example.com/hook");

    autoSend.checked = false;
    autoSend.dispatchEvent(new Event("change"));
    expect(intents.at(-1)).toEqual({
      type: "settings-change",
      patch: { webhooksEnabled: false },
    });
  });

  it("swaps the theme glyph and reports the toggle", () => {
    const { root, intents, render } = setup();
    const slots = root.querySelectorAll<HTMLElement>(".ag-settings-theme-icon");
    const toggle = query<HTMLButtonElement>(root, ".ag-settings-theme-toggle");

    expect(slots[0].hidden).toBe(false);
    expect(slots[1].hidden).toBe(true);
    expect(toggle.title).toBe("Switch to light mode");

    render({ theme: "light" });
    expect(slots[0].hidden).toBe(true);
    expect(slots[1].hidden).toBe(false);
    expect(toggle.title).toBe("Switch to dark mode");

    toggle.click();
    expect(intents).toEqual([{ type: "toggle-theme" }]);
  });

  it("mirrors the toolbar placement and flips near the viewport top", () => {
    const { root, render } = setup();
    const panel = query<HTMLElement>(root, ".ag-settings-panel");

    expect(root.style.left).toBe("");
    expect(root.style.right).toBe("");
    expect(panel.classList.contains("ag-settings-panel-below")).toBe(false);

    render({ toolbarPosition: { x: 40, y: 400 } });
    expect(root.style.left).toBe("40px");
    expect(root.style.top).toBe("400px");
    expect(root.style.right).toBe("auto");
    expect(root.style.bottom).toBe("auto");
    expect(panel.classList.contains("ag-settings-panel-below")).toBe(false);

    render({ toolbarPosition: { x: 40, y: 229 } });
    expect(panel.classList.contains("ag-settings-panel-below")).toBe(true);

    render({ toolbarPosition: null });
    expect(root.style.left).toBe("");
    expect(root.style.bottom).toBe("");
  });

  it("withdraws the closed panel from focus and the accessibility tree", () => {
    const { root, render } = setup({ settingsOpen: false });
    const panel = query<HTMLElement>(root, ".ag-settings-panel");

    expect(panel.classList.contains("ag-settings-exit")).toBe(true);
    expect(panel.hasAttribute("inert")).toBe(true);

    render({ settingsOpen: true });
    expect(panel.classList.contains("ag-settings-enter")).toBe(true);
    expect(panel.hasAttribute("inert")).toBe(false);
  });

  it("hides with the toolbar", () => {
    const { root, render } = setup();
    expect(root.hidden).toBe(false);
    render({ hidden: true });
    expect(root.hidden).toBe(true);
  });

  it("retains every node across updates and stops dispatching once destroyed", () => {
    const { root, region, intents, render } = setup();
    const input = query<HTMLInputElement>(root, "#agentation-webhook-url");
    const swatch = query<HTMLButtonElement>(root, ".ag-settings-color-option");
    const nodeCount = root.querySelectorAll("*").length;

    render({
      theme: "light",
      settingsPage: "automations",
      hasEndpoint: true,
      connection: "connected",
      metadataAdapterIds: ["react"],
      settings: { ...DEFAULT_SETTINGS, annotationColorId: "red" },
    });

    expect(query(root, "#agentation-webhook-url")).toBe(input);
    expect(query(root, ".ag-settings-color-option")).toBe(swatch);
    expect(root.querySelectorAll("*").length).toBe(nodeCount);

    region.destroy();
    intents.length = 0;
    swatch.click();
    expect(intents).toEqual([]);
  });
});

// =============================================================================
// Spec support
// =============================================================================
//
// Locators and flows shared by the parity specs. Everything here goes through
// real user input — clicks, keys, navigations — and reads state only from the
// DOM or from the consumer-side recorder the fixture pages install.
//
// Nothing calls into the runtime. There is no `page.evaluate(() => controller
// .destroy())` anywhere in this harness; the lifecycle controls are real buttons
// on the fixture pages.
// =============================================================================

import { expect, type Locator, type Page } from "@playwright/test";
import type { Harness, HarnessCall } from "../fixtures/harness";

export const REACT_APP = "http://127.0.0.1:4173";
export const SOLID_APP = "http://127.0.0.1:4174";
export const PROTOCOL = "http://127.0.0.1:4175";

/** `aria-keyshortcuts` doubles as the stable handle for each toolbar control. */
export const SHORTCUT = {
  freeze: "p",
  layout: "l",
  markers: "h",
  copy: "c",
  send: "s",
  clear: "x",
  exit: "Escape",
} as const;

export type Ui = {
  page: Page;
  overlay: Locator;
  toolbar: Locator;
  container: Locator;
  badge: Locator;
  liveStatus: Locator;
  /** A toolbar control addressed by its documented keyboard shortcut. */
  control: (shortcut: string) => Locator;
  settingsButton: Locator;
  settingsPanel: Locator;
  settingsDialog: Locator;
  popup: Locator;
  popupTextarea: Locator;
  popupSubmit: Locator;
  popupCancel: Locator;
  popupDelete: Locator;
  markers: Locator;
  layoutPalette: Locator;
};

/**
 * Every locator is rooted at `<agentation-overlay>`. Playwright's CSS engine
 * pierces open shadow roots, and the runtime's shadow root is open, so these
 * read exactly as they would for an unshadowed toolbar.
 */
export function ui(page: Page): Ui {
  const overlay = page.locator("agentation-overlay");
  return {
    page,
    overlay,
    toolbar: overlay.locator(".ag-toolbar"),
    container: overlay.locator(".ag-toolbar-container"),
    badge: overlay.locator(".ag-toolbar-badge"),
    liveStatus: overlay.locator(".ag-toolbar-live-status"),
    control: (shortcut: string): Locator =>
      overlay.locator(`.ag-toolbar-control-button[aria-keyshortcuts="${shortcut}"]`),
    settingsButton: overlay.locator('.ag-toolbar-control-button[aria-label="Settings"]'),
    settingsPanel: overlay.locator("[data-agentation-settings-panel]"),
    settingsDialog: overlay.locator('[role="dialog"][aria-label="Agentation settings"]'),
    popup: overlay.locator("[data-annotation-popup]"),
    popupTextarea: overlay.locator(".ag-popup-textarea"),
    popupSubmit: overlay.locator(".ag-popup-submit"),
    popupCancel: overlay.locator(".ag-popup-cancel"),
    popupDelete: overlay.locator(".ag-popup-delete"),
    markers: overlay.locator("[data-annotation-marker]"),
    layoutPalette: overlay.locator('[role="dialog"][aria-label="Layout Mode"]'),
  };
}

export type OpenOptions = {
  /** Protocol endpoint handed to the fixture as `config.endpoint`. */
  endpoint?: boolean;
  /** Webhook target handed to the fixture as `config.webhookUrl`. */
  webhook?: boolean;
  /** An explicit webhook URL, for the unreachable-destination case. */
  webhookUrl?: string;
  /** Registers an `onSubmit` callback. */
  submit?: boolean;
  /** `false` sets `copyToClipboard: false`. */
  clipboard?: boolean;
  className?: string;
  sessionId?: string;
  /** `false` leaves the page unmounted so the lifecycle spec can drive it. */
  mount?: boolean;
};

export function pageUrl(
  app: string,
  file: string,
  options: OpenOptions = {},
): string {
  const url = new URL(file, `${app}/`);
  if (options.endpoint) url.searchParams.set("endpoint", PROTOCOL);
  if (options.webhook) url.searchParams.set("webhook", `${PROTOCOL}/webhook`);
  if (options.webhookUrl) url.searchParams.set("webhook", options.webhookUrl);
  if (options.submit) url.searchParams.set("submit", "1");
  if (options.clipboard === false) url.searchParams.set("clipboard", "0");
  if (options.className) url.searchParams.set("class", options.className);
  if (options.sessionId) url.searchParams.set("session", options.sessionId);
  if (options.mount === false) url.searchParams.set("mount", "0");
  return url.toString();
}

/**
 * Loads a fixture page and waits until the harness recorder exists. Each spec
 * gets a fresh browser context, so `localStorage` always starts empty; a spec
 * that needs persistence reloads inside the same context.
 */
export async function open(
  page: Page,
  app: string,
  file: string,
  options: OpenOptions = {},
): Promise<Ui> {
  await page.goto(pageUrl(app, file, options));
  await page.waitForFunction(() => window.__harness !== undefined);
  if (options.mount !== false) {
    await expect(page.locator("agentation-overlay")).toHaveCount(1);
  }
  return ui(page);
}

/** Reads the consumer-side recorder. */
export function harness(page: Page): Promise<Harness> {
  return page.evaluate(() => ({
    calls: window.__harness.calls,
    events: window.__harness.events,
    mountErrors: window.__harness.mountErrors,
    generation: window.__harness.generation,
    intervalTicks: window.__harness.intervalTicks,
    timeoutTicks: window.__harness.timeoutTicks,
    mounted: window.__harness.mounted,
  }));
}

export async function calls(page: Page, name: string): Promise<HarnessCall[]> {
  const state = await harness(page);
  return state.calls.filter((call) => call.name === name);
}

/** Clicks the collapsed circle and waits for the expanded control row. */
export async function activate(view: Ui): Promise<void> {
  await view.container.click();
  await expect(view.container).toHaveClass(/is-expanded/);
  await expect(view.control(SHORTCUT.copy)).toBeVisible();
}

/** Leaves feedback mode the way a user does: Escape. */
export async function deactivate(view: Ui): Promise<void> {
  await view.page.keyboard.press("Escape");
  await expect(view.container).toHaveClass(/is-collapsed/);
}

/**
 * Opens or closes the settings panel.
 *
 * The panel node is retained across open/close — it animates with
 * `ag-settings-enter`/`ag-settings-exit` and keeps a box either way, exactly as
 * the original did — so openness is read from the gear's `aria-expanded`, which
 * is the accessible truth rather than a CSS artefact.
 */
export async function setSettingsOpen(view: Ui, open: boolean): Promise<void> {
  const expanded = await view.settingsButton.getAttribute("aria-expanded");
  if (expanded === String(open)) return;
  await view.settingsButton.click();
  await expect(view.settingsButton).toHaveAttribute("aria-expanded", String(open));
  // The panel keeps its box while it animates out, so openness is read from the
  // accessibility state: a closed panel is `inert`.
  if (open) await expect(view.settingsDialog).not.toHaveAttribute("inert", "");
  else await expect(view.settingsDialog).toHaveAttribute("inert", "");
}

/**
 * Clicks a harness control button.
 *
 * Feedback mode blocks page interaction by default, so while it is active a
 * click on the control bar is swallowed and annotates instead — that is the
 * product contract, asserted directly in the annotation spec. The lifecycle
 * controls therefore leave feedback mode first, exactly as a user would.
 */
export async function clickControl(view: Ui, id: string): Promise<void> {
  const expanded = await view.container
    .evaluate((node) => node.classList.contains("is-expanded"))
    .catch(() => false);
  if (expanded) await deactivate(view);
  await view.page.locator(`#${id}`).click();
}

/**
 * The full add-an-annotation gesture: click the target, type, press Add.
 *
 * `pressSequentially` rather than `fill`, because the popup's own key handling
 * (IME guard, Enter/Shift+Enter) is part of what the specs cover, and a value
 * assignment would step around it.
 */
export async function annotate(
  view: Ui,
  target: string,
  comment: string,
): Promise<void> {
  const before = await view.markers.count();
  await view.page.locator(target).click();
  await expect(view.popup).toBeVisible();
  await view.popupTextarea.pressSequentially(comment);
  await view.popupSubmit.click();
  await expect(view.popup).toBeHidden();
  await expect(view.markers).toHaveCount(before + 1);
}

/** The 1-based numbers currently drawn on the marker layer, in DOM order. */
export async function markerLabels(view: Ui): Promise<string[]> {
  return view.markers.locator(".ag-marker-label").allTextContents();
}

export type ProtocolRequest = {
  method: string;
  path: string;
  /** Whatever the runtime actually sent — never assumed to be any shape. */
  body: unknown;
};

export async function protocolRequests(page: Page): Promise<ProtocolRequest[]> {
  const response = await page.request.get(`${PROTOCOL}/__e2e/requests`);
  const payload = (await response.json()) as {
    requests: { method: string; path: string; body: unknown }[];
  };
  return payload.requests;
}

/** The `event` literal a webhook delivery carried, checked rather than asserted. */
export function webhookEvent(request: ProtocolRequest): string | undefined {
  const { body } = request;
  if (!body || typeof body !== "object" || !("event" in body)) return undefined;
  return typeof body.event === "string" ? body.event : undefined;
}

/** The markdown an `/action` or webhook `submit` request carried. */
export function requestOutput(request: ProtocolRequest): string | undefined {
  const { body } = request;
  if (!body || typeof body !== "object" || !("output" in body)) return undefined;
  return typeof body.output === "string" ? body.output : undefined;
}

export async function resetProtocol(page: Page): Promise<void> {
  await page.request.post(`${PROTOCOL}/__e2e/reset`);
}

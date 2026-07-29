// =============================================================================
// Keyboard
// =============================================================================
//
// Every documented shortcut, plus the negative case that matters most: typing in
// a page field must never trigger a single-letter shortcut.
//
// `ControlOrMeta` resolves to Meta on macOS and Control elsewhere, which is the
// same platform-primary modifier the runtime picks.
// =============================================================================

import { expect, test } from "@playwright/test";
import {
  REACT_APP,
  SHORTCUT,
  activate,
  annotate,
  calls,
  harness,
  open,
  setSettingsOpen,
} from "./support";

test("Cmd/Ctrl+Shift+F toggles feedback mode", async ({ page }) => {
  const view = await open(page, REACT_APP, "browser.html");
  await expect(view.container).toHaveClass(/is-collapsed/);

  await page.keyboard.press("ControlOrMeta+Shift+F");
  await expect(view.container).toHaveClass(/is-expanded/);

  await page.keyboard.press("ControlOrMeta+Shift+F");
  await expect(view.container).toHaveClass(/is-collapsed/);
});

test("P pauses and resumes animations", async ({ page }) => {
  const view = await open(page, REACT_APP, "browser.html");
  await activate(view);
  const freeze = view.control(SHORTCUT.freeze);
  await expect(freeze).toHaveAttribute("aria-pressed", "false");

  await page.keyboard.press("p");
  await expect(freeze).toHaveAttribute("aria-pressed", "true");
  await expect(freeze).toHaveAttribute("aria-label", "Resume animations");

  await page.keyboard.press("p");
  await expect(freeze).toHaveAttribute("aria-pressed", "false");
  await expect(freeze).toHaveAttribute("aria-label", "Pause animations");
});

test("L enters and leaves layout mode", async ({ page }) => {
  const view = await open(page, REACT_APP, "browser.html");
  await activate(view);
  const layout = view.control(SHORTCUT.layout);
  await expect(layout).toHaveAttribute("aria-pressed", "false");

  await page.keyboard.press("l");
  await expect(layout).toHaveAttribute("aria-pressed", "true");
  await expect(layout).toHaveAttribute("aria-label", "Exit layout mode");
  await expect(view.layoutPalette).toBeVisible();

  await page.keyboard.press("l");
  await expect(layout).toHaveAttribute("aria-pressed", "false");
});

test("H hides and shows markers, and needs an annotation first", async ({ page }) => {
  const view = await open(page, REACT_APP, "browser.html");
  await activate(view);
  const markers = view.control(SHORTCUT.markers);

  // No annotations: the control is disabled and the shortcut is a no-op.
  await expect(markers).toBeDisabled();
  await page.keyboard.press("h");
  await expect(markers).toHaveAttribute("aria-pressed", "true");

  await annotate(view, "#page-heading", "visible marker");
  await expect(markers).toBeEnabled();
  await expect(view.markers).toHaveCount(1);

  await page.keyboard.press("h");
  await expect(markers).toHaveAttribute("aria-pressed", "false");
  await expect(markers).toHaveAttribute("aria-label", "Show markers");
  // Hiding keeps the marker nodes for their exit transition, so visibility — not
  // node count — is the observable state. Clearing is what removes them.
  await expect(view.markers.first()).toBeHidden();

  await page.keyboard.press("h");
  await expect(markers).toHaveAttribute("aria-pressed", "true");
  await expect(view.markers.first()).toBeVisible();
});

test("C copies", async ({ page }) => {
  const view = await open(page, REACT_APP, "browser.html");
  await activate(view);
  await annotate(view, "#page-heading", "copy me with a key");

  await page.keyboard.press("c");

  await expect(view.liveStatus).toHaveText("Copied");
  expect((await calls(page, "onCopy"))[0].output).toContain("copy me with a key");
});

test("S submits", async ({ page }) => {
  const view = await open(page, REACT_APP, "browser.html", { submit: true });
  await activate(view);
  await annotate(view, "#page-heading", "send me with a key");

  await page.keyboard.press("s");

  await expect(view.liveStatus).toHaveText("Sent");
  expect((await calls(page, "onSubmit"))[0].output).toContain("send me with a key");
});

test("X clears every annotation", async ({ page }) => {
  const view = await open(page, REACT_APP, "browser.html");
  await activate(view);
  await annotate(view, "#page-heading", "one");
  await annotate(view, "#page-card-title", "two");

  await page.keyboard.press("x");

  await expect(view.markers).toHaveCount(0);
  expect(await calls(page, "onAnnotationsClear")).toMatchObject([{ count: 2 }]);
});

test("Escape unwinds layout, then settings, then feedback mode", async ({ page }) => {
  const view = await open(page, REACT_APP, "browser.html");
  await activate(view);

  // Popup first: Escape closes the editor and leaves feedback mode on.
  await page.locator("#page-heading").click();
  await expect(view.popup).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(view.popup).toBeHidden();
  await expect(view.container).toHaveClass(/is-expanded/);

  // Settings next.
  await setSettingsOpen(view, true);
  await page.keyboard.press("Escape");
  await expect(view.settingsButton).toHaveAttribute("aria-expanded", "false");
  await expect(view.container).toHaveClass(/is-expanded/);

  // Then layout mode.
  await page.keyboard.press("l");
  await expect(view.control(SHORTCUT.layout)).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(view.control(SHORTCUT.layout)).toHaveAttribute("aria-pressed", "false");
  await expect(view.container).toHaveClass(/is-expanded/);

  // Finally feedback mode itself.
  await page.keyboard.press("Escape");
  await expect(view.container).toHaveClass(/is-collapsed/);
});

test("typing in a page field never triggers a single-letter shortcut", async ({
  page,
}) => {
  const view = await open(page, REACT_APP, "browser.html", { submit: true });
  await activate(view);
  await annotate(view, "#page-heading", "leave me alone");

  const field = page.locator("#page-input");
  await field.click();
  // The click on a page field opens an editor first (it is an annotation target
  // like any other); cancel it so focus can settle in the field itself.
  await page.keyboard.press("Escape");
  await field.focus();

  const before = await harness(page);
  await field.pressSequentially("plchxs");

  await expect(field).toHaveValue("plchxs");
  // Nothing moved: no freeze, no layout, markers untouched, no copy or submit,
  // and the annotation is still there.
  await expect(view.control(SHORTCUT.freeze)).toHaveAttribute("aria-pressed", "false");
  await expect(view.control(SHORTCUT.layout)).toHaveAttribute("aria-pressed", "false");
  await expect(view.control(SHORTCUT.markers)).toHaveAttribute("aria-pressed", "true");
  await expect(view.markers).toHaveCount(1);
  expect(await calls(page, "onCopy")).toHaveLength(0);
  expect(await calls(page, "onSubmit")).toHaveLength(0);
  expect(await calls(page, "onAnnotationsClear")).toHaveLength(0);
  expect((await harness(page)).events.length).toBe(before.events.length);
});

test("typing in the annotation popup never triggers a single-letter shortcut", async ({
  page,
}) => {
  const view = await open(page, REACT_APP, "browser.html");
  await activate(view);

  await page.locator("#page-card-title").click();
  await expect(view.popup).toBeVisible();
  await view.popupTextarea.pressSequentially("pause layout hide copy send clear");

  await expect(view.popupTextarea).toHaveValue("pause layout hide copy send clear");
  await expect(view.control(SHORTCUT.freeze)).toHaveAttribute("aria-pressed", "false");
  await expect(view.control(SHORTCUT.layout)).toHaveAttribute("aria-pressed", "false");
  expect(await calls(page, "onCopy")).toHaveLength(0);
});

test("shortcuts still work with focus resting on the toolbar itself", async ({ page }) => {
  // Regression lock. `onKeyDown` used to bail whenever the event's composed path
  // contained the overlay host, and clicking the collapsed circle leaves focus
  // exactly there — so every shortcut was dead after a mouse activation.
  const view = await open(page, REACT_APP, "browser.html");
  await view.container.click();
  await expect(view.container).toHaveClass(/is-expanded/);

  await page.keyboard.press("p");
  await expect(view.control(SHORTCUT.freeze)).toHaveAttribute("aria-pressed", "true");

  // And with focus on a control that was just pressed.
  await view.control(SHORTCUT.freeze).click();
  await expect(view.control(SHORTCUT.freeze)).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("l");
  await expect(view.control(SHORTCUT.layout)).toHaveAttribute("aria-pressed", "true");
});

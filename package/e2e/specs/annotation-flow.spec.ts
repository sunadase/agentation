// =============================================================================
// Annotation flow
// =============================================================================
//
// The core loop: activate, click a target, type, save, see a numbered marker.
// Then edit, delete with live renumbering, clear, survive a reload, and stay
// scoped to the route that created them.
//
// Driven entirely through the toolbar and the page. The recorder is only used to
// check what the consumer's callbacks saw.
// =============================================================================

import { expect, test } from "@playwright/test";
import {
  REACT_APP,
  SHORTCUT,
  activate,
  annotate,
  calls,
  harness,
  markerLabels,
  open,
  setSettingsOpen,
} from "./support";

test("activate, click, type, save — a numbered marker appears", async ({ page }) => {
  const view = await open(page, REACT_APP, "browser.html");
  await activate(view);

  await page.locator("#page-heading").click();
  await expect(view.popup).toBeVisible();
  await expect(view.popup).toHaveAttribute("role", "dialog");
  // The popup names its target, and offers "Add" for a new annotation.
  await expect(view.popup).toHaveAttribute("aria-label", /Feedback for /);
  await expect(view.popupSubmit).toHaveText("Add");

  await view.popupTextarea.pressSequentially("the heading is too tight");
  await view.popupSubmit.click();

  await expect(view.popup).toBeHidden();
  await expect(view.markers).toHaveCount(1);
  expect(await markerLabels(view)).toEqual(["1"]);

  expect(await calls(page, "onAnnotationAdd")).toMatchObject([
    { name: "onAnnotationAdd", comment: "the heading is too tight" },
  ]);
});

test("an empty comment is refused instead of being saved", async ({ page }) => {
  const view = await open(page, REACT_APP, "browser.html");
  await activate(view);

  await page.locator("#page-heading").click();
  await expect(view.popup).toBeVisible();
  // Whitespace only. "Add" reports itself as `aria-disabled`, so the reachable
  // gesture is Enter — which the popup answers with a shake and a status line
  // rather than committing.
  await view.popupTextarea.pressSequentially("   ");
  await expect(view.popupSubmit).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Enter");

  await expect(view.overlay.locator('[role="status"]')).toHaveText(
    "Enter feedback before submitting.",
  );
  await expect(view.popup).toBeVisible();
  await expect(view.markers).toHaveCount(0);
  expect(await calls(page, "onAnnotationAdd")).toHaveLength(0);
});

test("Enter saves, Shift+Enter inserts a newline, Escape cancels", async ({ page }) => {
  const view = await open(page, REACT_APP, "browser.html");
  await activate(view);

  await page.locator("#page-card-title").click();
  await expect(view.popup).toBeVisible();
  await view.popupTextarea.pressSequentially("first line");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("second line");
  await expect(view.popupTextarea).toHaveValue("first line\nsecond line");

  await page.keyboard.press("Enter");
  await expect(view.popup).toBeHidden();
  await expect(view.markers).toHaveCount(1);
  expect((await calls(page, "onAnnotationAdd"))[0].comment).toBe(
    "first line\nsecond line",
  );

  // A second annotation, cancelled with Escape, must leave no trace.
  await page.locator("#page-card-body").click();
  await expect(view.popup).toBeVisible();
  await view.popupTextarea.pressSequentially("never saved");
  await page.keyboard.press("Escape");
  await expect(view.popup).toBeHidden();
  await expect(view.markers).toHaveCount(1);
  expect(await calls(page, "onAnnotationAdd")).toHaveLength(1);
});

test("clicking a marker edits its annotation", async ({ page }) => {
  const view = await open(page, REACT_APP, "browser.html");
  await activate(view);
  await annotate(view, "#page-heading", "original text");

  await view.markers.first().click();
  await expect(view.popup).toBeVisible();
  // Editing an existing annotation offers "Save" and pre-fills the draft.
  await expect(view.popupSubmit).toHaveText("Save");
  await expect(view.popupTextarea).toHaveValue("original text");

  await view.popupTextarea.press("ControlOrMeta+a");
  await view.popupTextarea.pressSequentially("edited text");
  await view.popupSubmit.click();

  await expect(view.popup).toBeHidden();
  await expect(view.markers).toHaveCount(1);
  expect(await calls(page, "onAnnotationUpdate")).toMatchObject([
    { name: "onAnnotationUpdate", comment: "edited text" },
  ]);
});

test("deleting the middle annotation renumbers the rest", async ({ page }) => {
  const view = await open(page, REACT_APP, "browser.html");
  await activate(view);
  await annotate(view, "#page-heading", "one");
  await annotate(view, "#page-card-title", "two");
  await annotate(view, "#page-card-badge", "three");
  expect(await markerLabels(view)).toEqual(["1", "2", "3"]);

  // Open the second marker and use the popup's delete control.
  await view.markers.nth(1).click();
  await expect(view.popup).toBeVisible();
  await expect(view.popupTextarea).toHaveValue("two");
  await view.popupDelete.click();

  await expect(view.markers).toHaveCount(2);
  expect(await calls(page, "onAnnotationDelete")).toMatchObject([
    { name: "onAnnotationDelete", comment: "two" },
  ]);
  // The survivors renumber 1..n; "three" is now 2.
  await expect(async () => {
    expect(await markerLabels(view)).toEqual(["1", "2"]);
  }).toPass();

  await view.markers.nth(1).click();
  await expect(view.popupTextarea).toHaveValue("three");
});

test("Clear all removes every annotation and reports them once", async ({ page }) => {
  const view = await open(page, REACT_APP, "browser.html");
  await activate(view);
  await annotate(view, "#page-heading", "one");
  await annotate(view, "#page-card-title", "two");

  await view.control(SHORTCUT.clear).click();

  await expect(view.markers).toHaveCount(0);
  expect(await calls(page, "onAnnotationsClear")).toMatchObject([
    { name: "onAnnotationsClear", count: 2 },
  ]);
  // Clear also disables the controls that need annotations.
  await expect(view.control(SHORTCUT.clear)).toBeDisabled();
  await expect(view.control(SHORTCUT.markers)).toBeDisabled();
});

test("annotations survive a reload and restore their numbering", async ({ page }) => {
  const view = await open(page, REACT_APP, "browser.html");
  await activate(view);
  await annotate(view, "#page-heading", "persisted one");
  await annotate(view, "#page-card-title", "persisted two");

  await page.reload();
  await page.waitForFunction(() => window.__harness !== undefined);

  // The collapsed circle carries the count before anything is expanded.
  await expect(view.badge).toHaveText("2");
  await activate(view);
  expect(await markerLabels(view)).toEqual(["1", "2"]);
  await view.markers.first().click();
  await expect(view.popupTextarea).toHaveValue("persisted one");
});

test("annotations are scoped to the route that created them", async ({ page }) => {
  const view = await open(page, REACT_APP, "browser.html");
  await activate(view);
  await annotate(view, "#page-heading", "route a only");
  await expect(view.badge).toHaveText("1");

  // Same fixture, same markup, different pathname.
  const other = await open(page, REACT_APP, "browser-route-b.html");
  await expect(other.badge).toBeHidden();
  await activate(other);
  await expect(other.markers).toHaveCount(0);

  await annotate(other, "#page-heading", "route b only");
  await expect(other.badge).toBeHidden(); // hidden while expanded
  await expect(other.markers).toHaveCount(1);

  // Back to the first route: its own single annotation, not route B's.
  const back = await open(page, REACT_APP, "browser.html");
  await expect(back.badge).toHaveText("1");
  await activate(back);
  await back.markers.first().click();
  await expect(back.popupTextarea).toHaveValue("route a only");
});

test("with page interactions blocked, the page handler never runs", async ({ page }) => {
  const view = await open(page, REACT_APP, "browser.html");
  const button = page.locator("#page-button");

  // Before activating, the button is an ordinary button.
  await button.click();
  await expect(button).toHaveAttribute("data-page-clicks", "1");

  await activate(view);
  await button.click();

  // Blocking is on by default: the page handler is suppressed, but the click
  // still produces an annotation target.
  await expect(button).toHaveAttribute("data-page-clicks", "1");
  await expect(view.popup).toBeVisible();
});

test("with blocking off, an interactive control passes through and is not annotated", async ({
  page,
}) => {
  const view = await open(page, REACT_APP, "browser.html");
  await activate(view);
  await setSettingsOpen(view, true);
  await page.locator('label[for="agentation-block-interactions"]').click();
  await expect(page.locator("#agentation-block-interactions")).not.toBeChecked();
  await setSettingsOpen(view, false);

  // An interactive control performs its page behaviour and creates nothing.
  const button = page.locator("#page-button");
  await button.click();
  await expect(button).toHaveAttribute("data-page-clicks", "1");
  await expect(view.popup).toBeHidden();
  await expect(view.markers).toHaveCount(0);

  // A non-interactive target is still annotatable with blocking off.
  await page.locator("#page-card-title").click();
  await expect(view.popup).toBeVisible();
});

test("selected page text is captured as a quote on the annotation", async ({ page }) => {
  const view = await open(page, REACT_APP, "browser.html");
  await activate(view);

  // A real drag inside a text element must select rather than start an area
  // selection, and the release opens the editor for that element.
  const paragraph = page.locator("#page-paragraph");
  const box = await paragraph.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + 10, box!.y + 10);
  await page.mouse.down();
  for (let step = 1; step <= 10; step += 1) {
    await page.mouse.move(box!.x + 10 + step * 22, box!.y + 10);
  }
  await page.mouse.up();

  // The popup quotes what was selected. (The selection itself is collapsed by
  // the popup taking focus, which is why the quote — not
  // `window.getSelection()` — is the observable contract here.)
  await expect(view.popup).toBeVisible();
  const quote = view.overlay.locator(".ag-popup-quote");
  await expect(quote).toBeVisible();
  // The drag starts a few pixels into the paragraph, so the leading "A" is
  // outside the selection, and the popup truncates the quote.
  await expect(quote).toContainText("gentation collects");

  await view.popupTextarea.pressSequentially("about this sentence");
  await view.popupSubmit.click();
  await expect(view.markers).toHaveCount(1);

  // The captured quote reaches the report.
  await view.control(SHORTCUT.copy).click();
  const markdown = (await calls(page, "onCopy"))[0].output ?? "";
  expect(markdown).toContain('**Selected text:** "gentation collects');
});

test("Cmd/Ctrl+Shift+click groups several targets into one annotation", async ({
  page,
}) => {
  const view = await open(page, REACT_APP, "browser.html");
  await activate(view);

  // Toggle two targets with the platform-primary modifier held. No popup opens
  // while the modifier is down.
  await page.keyboard.down("ControlOrMeta");
  await page.keyboard.down("Shift");
  await page.locator("#page-heading").click({ modifiers: ["ControlOrMeta", "Shift"] });
  await expect(view.popup).toBeHidden();
  await page.locator("#page-card-title").click({ modifiers: ["ControlOrMeta", "Shift"] });
  await expect(view.popup).toBeHidden();

  // Releasing a modifier commits the selection as a single grouped annotation.
  await page.keyboard.up("Shift");
  await page.keyboard.up("ControlOrMeta");

  await expect(view.popup).toBeVisible();
  await view.popupTextarea.pressSequentially("both of these");
  await view.popupSubmit.click();

  await expect(view.markers).toHaveCount(1);
  expect(await markerLabels(view)).toEqual(["1"]);
  expect(await calls(page, "onAnnotationAdd")).toMatchObject([
    { name: "onAnnotationAdd", comment: "both of these" },
  ]);
});

test("Escape abandons a modifier selection without creating anything", async ({
  page,
}) => {
  const view = await open(page, REACT_APP, "browser.html");
  await activate(view);

  await page.locator("#page-heading").click({ modifiers: ["ControlOrMeta", "Shift"] });
  await page.keyboard.press("Escape");

  await expect(view.popup).toBeHidden();
  await expect(view.markers).toHaveCount(0);
  expect(await calls(page, "onAnnotationAdd")).toHaveLength(0);
  // Feedback mode itself is still on: Escape unwound the selection first.
  await expect(view.container).toHaveClass(/is-expanded/);
});

// =============================================================================
// Solid adapter
// =============================================================================
//
// The Solid fixture has its own Vite app and its own port, because Solid Devtools
// instruments every `.tsx` client transform and would otherwise contaminate the
// React parity oracle.
//
// The metadata contract is deliberately narrow: `agentationSolidMetadata()` runs
// Solid Devtools with `jsxLocation` on and `componentLocation`/`key` off, so the
// only promise is source file/line/column for native JSX elements. Component
// ancestry is NOT promised — Solid Devtools exposes no stable public DOM-to-owner
// registry — and this spec asserts the promise rather than a wish.
// =============================================================================

import { expect, test } from "@playwright/test";
import { SHORTCUT, SOLID_APP, activate, annotate, calls, open } from "./support";

test("the Solid adapter mounts and annotates", async ({ page }) => {
  const view = await open(page, SOLID_APP, "solid.html");
  await activate(view);
  await annotate(view, "#page-card-title", "solid annotation");

  expect(await calls(page, "onAnnotationAdd")).toMatchObject([
    { name: "onAnnotationAdd", comment: "solid annotation" },
  ]);
});

test("an annotated JSX element carries its source file, line and column", async ({
  page,
}) => {
  const view = await open(page, SOLID_APP, "solid.html");

  // The compiler pass stamps native JSX elements. `#page` is built with
  // `document.createElement` so the four fixtures stay byte-identical, which is
  // exactly why the fixture also renders one real JSX button.
  const target = page.locator("#solid-jsx-button");
  await expect(target).toHaveAttribute("data-source-loc", /solid\.entry\.tsx:\d+:\d+$/);

  await activate(view);
  await annotate(view, "#solid-jsx-button", "where does this live");

  await view.control(SHORTCUT.copy).click();
  const markdown = (await calls(page, "onCopy"))[0].output ?? "";

  // The report carries file:line:column taken from the compiler attribute.
  expect(markdown).toMatch(/\*\*Source:\*\* solid\.entry\.tsx:\d+:\d+/);
  // And no fabricated component path: Solid ancestry is not promised.
  expect(markdown).not.toContain("**Solid:**");
});

test("an element with no compiler metadata still annotates from the DOM", async ({
  page,
}) => {
  const view = await open(page, SOLID_APP, "solid.html");
  // Nothing inside `#page` is JSX, so nothing there has `data-source-loc`.
  await expect(page.locator("#page-card-title")).not.toHaveAttribute(
    "data-source-loc",
    /./,
  );

  await activate(view);
  await annotate(view, "#page-card-title", "no source metadata here");

  await view.control(SHORTCUT.copy).click();
  const markdown = (await calls(page, "onCopy"))[0].output ?? "";

  expect(markdown).toContain("no source metadata here");
  // The element is still identified, just without a source location.
  expect(markdown).toContain("### 1. h2");
  expect(markdown).not.toMatch(/\*\*Source:\*\*/);
});

test("reactive reconfiguration keeps the same runtime and reaches the newest callback", async ({
  page,
}) => {
  // Solid's contract is full-config replacement through a reactive spread: the
  // wrapper must forward it to the live controller with `configure`, never by
  // tearing the runtime down.
  const view = await open(page, SOLID_APP, "solid.html");
  await activate(view);
  await annotate(view, "#page-heading", "generation zero");
  expect((await calls(page, "onAnnotationAdd"))[0].generation).toBe(0);

  await page.keyboard.press("Escape");
  await page.locator("#harness-reconfigure").click();
  await expect(view.overlay).toHaveCount(1);
  await expect(view.markers).toHaveCount(1);

  await activate(view);
  await annotate(view, "#page-card-badge", "generation one");
  const added = await calls(page, "onAnnotationAdd");
  expect(added).toHaveLength(2);
  expect(added[1].generation).toBe(1);
});

test("disposing the Solid wrapper removes the overlay; remounting is clean", async ({
  page,
}) => {
  const view = await open(page, SOLID_APP, "solid.html");
  await activate(view);
  await annotate(view, "#page-heading", "before dispose");

  await page.keyboard.press("Escape");
  await page.locator("#harness-unmount").click();
  await expect(view.overlay).toHaveCount(0);

  await page.locator("#harness-mount").click();
  await expect(view.overlay).toHaveCount(1);
  await expect(view.container).toHaveClass(/is-collapsed/);
  // The persisted annotation is restored by the fresh runtime.
  await expect(view.badge).toHaveText("1");
  await activate(view);
  await expect(view.markers).toHaveCount(1);
});

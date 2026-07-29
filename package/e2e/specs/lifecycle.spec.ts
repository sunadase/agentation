// =============================================================================
// Lifecycle
// =============================================================================
//
// Mount, reconfiguration reaching the live callbacks, unmount removing the
// element, remount, and the one-instance-per-document guard — on all three
// integration shapes: the framework-free runtime, the React adapter and the
// Solid adapter.
//
// Every step is a real click or key press on a fixture control. Nothing here
// constructs or destroys a controller directly, because a user cannot.
// =============================================================================

import { expect, test } from "@playwright/test";
import { CONTROL_IDS } from "../fixtures/harness";
import {
  REACT_APP,
  SOLID_APP,
  activate,
  annotate,
  calls,
  clickControl,
  harness,
  open,
  ui,
} from "./support";

const PAGES = [
  { name: "browser runtime", app: REACT_APP, file: "browser.html" },
  { name: "React adapter", app: REACT_APP, file: "react.html" },
  { name: "Solid adapter", app: SOLID_APP, file: "solid.html" },
] as const;

for (const target of PAGES) {
  test.describe(target.name, () => {
    test("mounts one overlay and expands on click", async ({ page }) => {
      const view = await open(page, target.app, target.file);

      await expect(view.overlay).toHaveCount(1);
      await expect(view.container).toHaveAttribute("aria-label", "Start feedback mode");
      await activate(view);
      await expect(view.control("Escape")).toBeVisible();
    });

    test("does not mount until asked, then mounts on click", async ({ page }) => {
      const view = await open(page, target.app, target.file, { mount: false });

      await expect(view.overlay).toHaveCount(0);
      await page.locator(`#${CONTROL_IDS.mount}`).click();
      await expect(view.overlay).toHaveCount(1);
      await expect(page.locator(`#${CONTROL_IDS.state}`)).toHaveText("mounted");
    });

    test("unmount removes the element; remount gives a clean runtime", async ({ page }) => {
      const view = await open(page, target.app, target.file);
      await activate(view);

      await clickControl(view, CONTROL_IDS.unmount);
      await expect(view.overlay).toHaveCount(0);
      await expect(page.locator(`#${CONTROL_IDS.state}`)).toHaveText("unmounted");

      await page.locator(`#${CONTROL_IDS.mount}`).click();
      await expect(view.overlay).toHaveCount(1);
      // A remounted runtime starts collapsed: activation is session state, not
      // persisted state.
      await expect(view.container).toHaveClass(/is-collapsed/);
      await activate(view);
    });

    test("reconfiguration reaches the live callbacks without remounting", async ({ page }) => {
      const view = await open(page, target.app, target.file);
      await activate(view);
      await annotate(view, "#page-heading", "before reconfigure");

      const first = await calls(page, "onAnnotationAdd");
      expect(first).toHaveLength(1);
      expect(first[0].generation).toBe(0);

      const loadsBefore = (await harness(page)).events.filter(
        (event) => event.type === "annotations" && event.reason === "load",
      ).length;

      await clickControl(view, CONTROL_IDS.reconfigure);

      // A remount would reload the route and emit a second `annotations/load`,
      // so an unchanged count is consumer-visible proof that `configure` reached
      // the existing runtime instead of replacing it.
      const after = await harness(page);
      expect(
        after.events.filter(
          (event) => event.type === "annotations" && event.reason === "load",
        ),
      ).toHaveLength(loadsBefore);
      await expect(view.overlay).toHaveCount(1);
      // The annotation made before reconfiguring is still there.
      await expect(view.markers).toHaveCount(1);

      await activate(view);
      await annotate(view, "#page-card-title", "after reconfigure");
      const second = await calls(page, "onAnnotationAdd");
      expect(second).toHaveLength(2);
      // Only the newest config's callback may fire for the newest annotation.
      expect(second[1].generation).toBe(1);
      expect(second[1].comment).toBe("after reconfigure");
    });

    test("a second mount in the same document throws", async ({ page }) => {
      const view = await open(page, target.app, target.file);

      await page.locator(`#${CONTROL_IDS.mountSecond}`).click();

      const state = await harness(page);
      expect(state.mountErrors).toEqual([
        "Only one Agentation instance per document is supported",
      ]);
      // The rejected mount left the original runtime alone.
      await expect(view.overlay).toHaveCount(1);
      await activate(view);
    });
  });
}

test("teardown removes the overlay, its shadow UI and the freeze stylesheet", async ({
  page,
}) => {
  const view = await open(page, REACT_APP, "browser.html");
  await activate(view);
  await expect(view.toolbar).toBeVisible();
  // Freeze first so teardown has a stylesheet to clean up.
  await page.keyboard.press("p");
  await expect(page.locator("#feedback-freeze-styles")).toHaveCount(1);

  await clickControl(view, CONTROL_IDS.unmount);

  await expect(view.overlay).toHaveCount(0);
  await expect(ui(page).toolbar).toHaveCount(0);
  await expect(page.locator("#feedback-freeze-styles")).toHaveCount(0);
});

test("a stationary press on the collapsed circle activates; a drag moves it instead", async ({
  page,
}) => {
  // Regression lock. `model.dragging` used to be `toolbarDrag !== null`, so every
  // `pointerdown` on the toolbar background made the toolbar region swallow the
  // trailing click and the circle could never be activated with a real mouse.
  const view = await open(page, REACT_APP, "browser.html");
  const start = await view.container.boundingBox();
  expect(start).not.toBeNull();

  const centre = {
    x: start!.x + start!.width / 2,
    y: start!.y + start!.height / 2,
  };
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down();
  await page.mouse.up();
  await expect(view.container).toHaveClass(/is-expanded/);

  await page.keyboard.press("Escape");
  await expect(view.container).toHaveClass(/is-collapsed/);

  // A real drag past the 10 px threshold repositions the toolbar and must NOT
  // activate feedback mode.
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down();
  await page.mouse.move(centre.x - 200, centre.y - 150, { steps: 10 });
  await page.mouse.up();

  await expect(view.container).toHaveClass(/is-collapsed/);
  const moved = await view.container.boundingBox();
  expect(Math.round(moved!.x)).not.toBe(Math.round(start!.x));
  expect(Math.round(moved!.y)).not.toBe(Math.round(start!.y));
});

test("the collapsed circle activates even when a submit destination is configured", async ({
  page,
}) => {
  // Regression lock. `.ag-toolbar-send.is-send-visible` sets `pointer-events:
  // auto`, which beats the hidden control row's `none`, so the invisible Send
  // button used to cover the circle and fire a submit instead of activating.
  const view = await open(page, REACT_APP, "browser.html", {
    endpoint: true,
    submit: true,
  });

  await activate(view);
  expect(await calls(page, "onSubmit")).toHaveLength(0);
  await expect(view.control("s")).toBeVisible();
});

// =============================================================================
// Animation freeze — Chromium only
// =============================================================================
//
// Chromium is the exact oracle for the freeze primitive: CSS `animation-play-
// state`, `Document.getAnimations()` and media element semantics all differ
// enough across engines that a shared assertion would only test the weakest one.
// Firefox and WebKit skip this file (see `CHROMIUM_ONLY` in the config); the
// controller itself degrades rather than throwing where `getAnimations` is
// missing, and the lifecycle and annotation specs still run everywhere.
//
// Everything asserted here is page-observable: computed style, WAAPI state, the
// video's own `paused` flag, and counters the fixture's own timers advance.
// =============================================================================

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { IDS } from "../fixtures/page-body";
import { REACT_APP, SHORTCUT, activate, harness, open } from "./support";

/** Starts the fixture's `<video>` from a canvas stream so it has real frames. */
async function startVideo(page: Page): Promise<boolean> {
  return page.evaluate(async (id) => {
    const video = document.getElementById(id);
    if (!(video instanceof HTMLVideoElement)) return false;
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 90;
    const context = canvas.getContext("2d");
    if (!context) return false;
    // Keep repainting so the stream produces frames.
    let hue = 0;
    setInterval(() => {
      hue = (hue + 7) % 360;
      context.fillStyle = `hsl(${hue} 70% 50%)`;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }, 40);
    const capture = canvas as HTMLCanvasElement & {
      captureStream?: (fps?: number) => MediaStream;
    };
    if (typeof capture.captureStream !== "function") return false;
    video.srcObject = capture.captureStream(25);
    try {
      await video.play();
    } catch {
      return false;
    }
    return !video.paused;
  }, IDS.video);
}

test("P freezes CSS animations, WAAPI animations and video; resuming restores them", async ({
  page,
}) => {
  const view = await open(page, REACT_APP, "browser.html");
  const playing = await startVideo(page);
  await activate(view);

  const css = page.locator(`#${IDS.cssAnimation}`);
  const waapi = page.locator(`#${IDS.waapiAnimation}`);
  await expect(css).toHaveCSS("animation-play-state", "running");

  await page.keyboard.press("p");
  await expect(view.control(SHORTCUT.freeze)).toHaveAttribute("aria-pressed", "true");

  // --- CSS ------------------------------------------------------------------
  await expect(css).toHaveCSS("animation-play-state", "paused");
  const cssBefore = await css.evaluate(
    (node) => document.getAnimations().find((a) => a.effect?.target === node)?.currentTime ?? null,
  );
  // --- WAAPI ----------------------------------------------------------------
  const waapiState = await waapi.evaluate(
    (node) => document.getAnimations().find((a) => a.effect?.target === node)?.playState,
  );
  expect(waapiState).toBe("paused");
  const waapiBefore = await waapi.evaluate(
    (node) => document.getAnimations().find((a) => a.effect?.target === node)?.currentTime ?? null,
  );
  // --- Video ----------------------------------------------------------------
  if (playing) {
    await expect(page.locator(`#${IDS.video}`)).toHaveJSProperty("paused", true);
    await expect(page.locator(`#${IDS.video}`)).toHaveAttribute("data-was-paused", "false");
  } else {
    // Recorded rather than silently skipped: the media path is only meaningful
    // where the fixture could actually start playback.
    test.info().annotations.push({
      type: "degraded",
      description: "canvas.captureStream playback unavailable; video freeze not asserted",
    });
  }

  // Nothing advances while frozen.
  await page.waitForTimeout(400);
  expect(
    await css.evaluate(
      (node) => document.getAnimations().find((a) => a.effect?.target === node)?.currentTime ?? null,
    ),
  ).toBe(cssBefore);
  expect(
    await waapi.evaluate(
      (node) => document.getAnimations().find((a) => a.effect?.target === node)?.currentTime ?? null,
    ),
  ).toBe(waapiBefore);

  // --- Resume ---------------------------------------------------------------
  await page.keyboard.press("p");
  await expect(view.control(SHORTCUT.freeze)).toHaveAttribute("aria-pressed", "false");
  await expect(css).toHaveCSS("animation-play-state", "running");
  await expect
    .poll(async () =>
      waapi.evaluate(
        (node) => document.getAnimations().find((a) => a.effect?.target === node)?.playState,
      ),
    )
    .toBe("running");
  if (playing) {
    await expect(page.locator(`#${IDS.video}`)).toHaveJSProperty("paused", false);
  }
});

test("the page's timers stall while frozen and drain afterwards", async ({ page }) => {
  const view = await open(page, REACT_APP, "browser.html");
  await activate(view);

  await page.keyboard.press("p");
  const frozen = await harness(page);
  await page.waitForTimeout(400);
  const stillFrozen = await harness(page);

  // `setInterval` callbacks are skipped outright, and the chained `setTimeout`
  // is queued, so neither counter may move.
  expect(stillFrozen.intervalTicks).toBe(frozen.intervalTicks);
  expect(stillFrozen.timeoutTicks).toBe(frozen.timeoutTicks);

  await page.keyboard.press("p");
  await expect
    .poll(async () => (await harness(page)).intervalTicks)
    .toBeGreaterThan(frozen.intervalTicks);
  await expect
    .poll(async () => (await harness(page)).timeoutTicks)
    .toBeGreaterThan(frozen.timeoutTicks);
});

test("Agentation's own UI keeps running while the page is frozen", async ({ page }) => {
  const view = await open(page, REACT_APP, "browser.html");
  await activate(view);

  // The freeze stylesheet must exclude Agentation's own subtree.
  await page.keyboard.press("p");
  await expect(page.locator("#feedback-freeze-styles")).toHaveCount(1);
  await expect(view.toolbar).toHaveCSS("animation-play-state", "running");

  // The popup's entrance timers run on the unfrozen scheduler, so an annotation
  // is still fully usable while the page is stopped.
  await page.locator("#page-card-title").click();
  await expect(view.popup).toBeVisible();
  await expect(view.popup).toHaveClass(/is-entered/);
  await view.popupTextarea.pressSequentially("frozen but usable");
  await view.popupSubmit.click();
  await expect(view.markers).toHaveCount(1);

  // The "Copied" acknowledgement is a 2 s timer on the unfrozen scheduler: it
  // has to expire even though every page timer is stopped.
  await page.keyboard.press("c");
  await expect(view.liveStatus).toHaveText("Copied");
  await expect(view.liveStatus).toHaveText("", { timeout: 5000 });

  // And the page really was frozen the whole time.
  const state = await harness(page);
  await page.waitForTimeout(250);
  expect((await harness(page)).intervalTicks).toBe(state.intervalTicks);
});

test("leaving feedback mode releases the freeze", async ({ page }) => {
  const view = await open(page, REACT_APP, "browser.html");
  await activate(view);
  await page.keyboard.press("p");
  await expect(page.locator("#feedback-freeze-styles")).toHaveCount(1);

  await page.keyboard.press("Escape");

  await expect(view.container).toHaveClass(/is-collapsed/);
  await expect(page.locator("#feedback-freeze-styles")).toHaveCount(0);
  await expect(page.locator(`#${IDS.cssAnimation}`)).toHaveCSS(
    "animation-play-state",
    "running",
  );
});

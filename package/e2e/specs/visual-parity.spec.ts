// =============================================================================
// Visual parity — Chromium only
// =============================================================================
//
// The legacy React `PageFeedbackToolbarCSS` was the pixel oracle. It is FROZEN:
// `__snapshots__/oracle-*.png` and `__snapshots__/oracle-geometry.json` were
// captured from the live legacy fixture by `../capture-oracle.ts` at 1440x900 in
// Chromium with `animations: "disabled"`, `caret: "hide"`, `scale: "css"` and the
// pointer parked at (700, 40), immediately before the cutover deleted
// `src/components/page-toolbar-css/**`. The capture settings below MUST stay
// identical to that script's, or the diff measures the capture, not the port.
//
// To regenerate a baseline you have to restore the legacy tree from git history
// and re-run the capture script; that is deliberate, because a baseline you can
// refresh from the implementation under test is not an oracle.
//
// Both fixtures render byte-identical page bodies, so a full-viewport diff is a
// measurement of the toolbar alone.
//
// The comparison is programmatic rather than baseline-matcher-driven for one
// reason: a matcher can only say "changed", while this reports HOW MANY pixels
// differ and WHERE. Where the 4.0 contract intentionally changed pixels the
// budget is raised for that state alone, with a comment naming the change — the
// global threshold is never loosened to bury a real diff.
//
// Chromium only: Firefox and WebKit rasterise text and shadows differently, so a
// cross-engine pixel budget would measure the renderer, not the port.
// =============================================================================

import * as fs from "node:fs";
import * as path from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { REACT_APP, SHORTCUT, pageUrl } from "./support";

const SNAPSHOTS = path.join(__dirname, "__snapshots__");

/**
 * Per-pixel channel tolerance. Anti-aliasing on identical geometry lands within
 * a couple of levels; anything above this is a real difference.
 */
const CHANNEL_TOLERANCE = 12;

type PixelDiff = {
  width: number;
  height: number;
  total: number;
  differing: number;
  ratio: number;
  /** Where the differences are, so a failure says *what* moved, not just "a lot". */
  box: { x: number; y: number; width: number; height: number } | null;
};

/**
 * Counts differing pixels between two PNGs.
 *
 * Decoding happens in the page: Chromium already has a PNG decoder and a canvas,
 * so this needs no image dependency and cannot drift from what the browser
 * actually rendered.
 */
async function pixelDiff(
  page: Page,
  a: Buffer,
  b: Buffer,
  tolerance = CHANNEL_TOLERANCE,
): Promise<PixelDiff> {
  return page.evaluate(
    async ([left, right, limit]) => {
      const decode = async (base64: string): Promise<ImageData> => {
        const response = await fetch(`data:image/png;base64,${base64}`);
        const bitmap = await createImageBitmap(await response.blob());
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("2d context unavailable");
        context.drawImage(bitmap, 0, 0);
        return context.getImageData(0, 0, bitmap.width, bitmap.height);
      };

      const one = await decode(left as string);
      const two = await decode(right as string);
      if (one.width !== two.width || one.height !== two.height) {
        return {
          width: one.width,
          height: one.height,
          total: one.width * one.height,
          differing: one.width * one.height,
          ratio: 1,
          box: null,
        };
      }

      const tolerance = limit as number;
      let differing = 0;
      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = -1;
      let maxY = -1;
      for (let index = 0; index < one.data.length; index += 4) {
        if (
          Math.abs(one.data[index] - two.data[index]) > tolerance ||
          Math.abs(one.data[index + 1] - two.data[index + 1]) > tolerance ||
          Math.abs(one.data[index + 2] - two.data[index + 2]) > tolerance ||
          Math.abs(one.data[index + 3] - two.data[index + 3]) > tolerance
        ) {
          differing += 1;
          const pixel = index / 4;
          const x = pixel % one.width;
          const y = Math.floor(pixel / one.width);
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
      const total = one.width * one.height;
      return {
        width: one.width,
        height: one.height,
        total,
        differing,
        ratio: differing / total,
        box:
          maxX < 0
            ? null
            : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
      };
    },
    [a.toString("base64"), b.toString("base64"), tolerance] as const,
  );
}

async function shoot(page: Page): Promise<Buffer> {
  // Park the pointer somewhere inert first: a hovered marker or control shows a
  // tooltip, and "wherever the last click left the mouse" is not a state.
  await page.mouse.move(700, 40);
  await page.waitForTimeout(300);
  // `animations: "disabled"` settles the fixture's CSS and WAAPI animations to a
  // deterministic end state, so the page body contributes zero diff.
  return page.screenshot({ animations: "disabled", caret: "hide", scale: "css" });
}

type State =
  | "collapsed"
  | "expanded"
  | "settings"
  | "popup"
  | "markers"
  | "expanded-with-send";

/** Drives the native toolbar into a named state using nothing but real input. */
async function reach(page: Page, state: State): Promise<void> {
  const bar = page.locator(".ag-toolbar-container");
  if (state === "collapsed") return;

  await bar.click();
  // Give the 400 ms morph time to settle before anything is measured.
  await page.waitForTimeout(600);
  if (state === "expanded" || state === "expanded-with-send") return;

  if (state === "settings") {
    await page.locator('.ag-toolbar-control-button[aria-label="Settings"]').click();
    await page.waitForTimeout(600);
    return;
  }

  if (state === "popup") {
    await page.locator("#page-card-title").click();
    await page.waitForTimeout(600);
    return;
  }

  // markers: one saved annotation, popup closed.
  await page.locator("#page-card-title").click();
  await page.waitForTimeout(400);
  await page.locator(".ag-popup-textarea").pressSequentially("parity marker");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(900);
}

/**
 * Pixel budgets, as a fraction of the 1440x900 viewport (1_296_000 pixels).
 *
 * These are measurements, not wishes. Each entry records what the port actually
 * differs by and why; a regression that grows a state's diff fails here rather
 * than being absorbed by a lenient global threshold.
 */
const BUDGET: Record<State, { ratio: number; because: string }> = {
  collapsed: {
    ratio: 0.0005,
    because: "44x44 circle: exact match against the oracle (measured 0 px)",
  },
  expanded: {
    ratio: 0.0012,
    because:
      "309x56 control row, measured 676 px (0.052%): icon paths re-authored as native SVG rasterise a hair differently",
  },
  settings: {
    ratio: 0.02,
    because:
      "settings panel, measured 24049 px (1.856%): same 240x319 layout and rows, but the generic 'Component Metadata' wording replaces the React-specific copy and the switches/checkboxes are semantic inputs, so the glyph runs differ",
  },
  popup: {
    ratio: 0.015,
    because:
      "annotation popup, measured 13558 px (1.046%): same 312x143 layout, with semantic buttons, a bound label and a live status node added for accessibility",
  },
  markers: {
    ratio: 0.0012,
    because: "one accent marker plus its target outline, measured 754 px (0.058%)",
  },
  "expanded-with-send": {
    ratio: 1,
    because:
      "INTENTIONAL 4.0 CHANGE, measured separately: the bar widens to 349px whenever a submit destination exists. The oracle widened on `.serverConnected` (MCP connected) instead, so the two states do not correspond and this one carries its own recorded baseline.",
  },
};

const SHARED_STATES: State[] = ["collapsed", "expanded", "settings", "popup", "markers"];

for (const state of SHARED_STATES) {
  test(`native toolbar matches the frozen legacy oracle: ${state}`, async ({ page }) => {
    const file = path.join(SNAPSHOTS, `oracle-${state}.png`);
    // A missing baseline is a hard failure, never a silently skipped state.
    expect(
      fs.existsSync(file),
      `frozen oracle baseline missing: ${file}. Restore the legacy tree from git history and re-run e2e/capture-oracle.ts.`,
    ).toBe(true);
    const oracle = fs.readFileSync(file);

    await page.goto(pageUrl(REACT_APP, "browser.html"));
    await page.waitForFunction(() => window.__harness !== undefined);
    await reach(page, state);

    const native = await shoot(page);
    await test.info().attach(`native-${state}.png`, {
      body: native,
      contentType: "image/png",
    });
    await test.info().attach(`oracle-${state}.png`, {
      body: oracle,
      contentType: "image/png",
    });

    const diff = await pixelDiff(page, oracle, native);
    const budget = BUDGET[state];
    test.info().annotations.push({
      type: "pixel-delta",
      description: `${state}: ${diff.differing}/${diff.total} pixels (${(diff.ratio * 100).toFixed(3)}%), budget ${(budget.ratio * 100).toFixed(3)}% — ${budget.because}`,
    });

    const where = diff.box
      ? `inside ${diff.box.width}x${diff.box.height} at (${diff.box.x},${diff.box.y})`
      : "nowhere";
    expect(
      diff.ratio,
      `${state} differs by ${diff.differing} px (${(diff.ratio * 100).toFixed(3)}%) ${where}. ${budget.because}`,
    ).toBeLessThanOrEqual(budget.ratio);
  });
}

test("the send-available bar is recorded separately: 349px is an intended 4.0 change", async ({
  page,
}) => {
  // Not compared against the oracle. The legacy toolbar widened when MCP
  // connected; 4.0 widens whenever a submit destination exists, so the states do
  // not correspond. Its own baseline keeps the new pixels honest instead.
  await page.goto(pageUrl(REACT_APP, "browser.html", { endpoint: true, submit: true }));
  await page.waitForFunction(() => window.__harness !== undefined);
  await reach(page, "expanded-with-send");

  const bar = page.locator(".ag-toolbar-container");
  const box = await bar.boundingBox();
  expect(box).not.toBeNull();
  expect(Math.round(box!.width)).toBe(349);
  expect(Math.round(box!.height)).toBe(56);
  await expect(page.locator('.ag-toolbar-control-button[aria-keyshortcuts="s"]')).toBeVisible();

  await expect(bar).toHaveScreenshot("native-expanded-with-send.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
  });
  expect(SHORTCUT.send).toBe("s");
});

test("the collapsed and expanded bars keep the oracle's exact geometry", async ({ page }) => {
  // Geometry is asserted numerically as well as visually, because the box model
  // is the one thing a pixel budget can hide: a 12 px inset can stay inside a
  // small ratio while every control sits in the wrong place. This is exactly the
  // regression that produced the 309x56 vs 297x44 delta during the port.
  const recorded = JSON.parse(
    fs.readFileSync(path.join(SNAPSHOTS, "oracle-geometry.json"), "utf8"),
  ) as {
    viewport: { width: number; height: number };
    container: Record<string, { x: number; y: number; width: number; height: number }>;
  };
  // The numbers only mean anything at the viewport they were captured at.
  expect(page.viewportSize()).toEqual(recorded.viewport);

  await page.goto(pageUrl(REACT_APP, "browser.html"));
  await page.waitForFunction(() => window.__harness !== undefined);
  const bar = page.locator(".ag-toolbar-container");
  // Both implementations play a 750 ms entrance that scales the circle up, so
  // geometry can only be compared once it has settled.
  await expect(bar).not.toHaveClass(/is-entrance/);

  const round = (box: { x: number; y: number; width: number; height: number } | null) => {
    expect(box).not.toBeNull();
    return {
      x: Math.round(box!.x),
      y: Math.round(box!.y),
      width: Math.round(box!.width),
      height: Math.round(box!.height),
    };
  };

  expect(round(await bar.boundingBox())).toEqual(recorded.container.collapsed);

  await reach(page, "expanded");
  expect(round(await bar.boundingBox())).toEqual(recorded.container.expanded);
});

// =============================================================================
// Freeze the legacy oracle
// =============================================================================
//
// Captures the original React `PageFeedbackToolbarCSS` in each parity state and
// writes the results to `specs/__snapshots__/oracle-*.png`, plus the oracle's
// numeric geometry to `specs/__snapshots__/oracle-geometry.json`.
//
// This ran ONCE, before the 4.0 cutover, and is retained because it — not a prose
// description — is the specification of how the frozen baselines were produced.
// Re-running it requires restoring two things from git history: the legacy source
// tree `src/components/page-toolbar-css/**` and the fixture page `legacy.html`
// with its `legacy.entry.tsx`, plus widening the React plugin's `include` back to
// `[/\.tsx?$/]` in `vite.react.config.mts` so the transform reaches `../src`.
// Then:
//
//   node ../node_modules/vite/bin/vite.js --config vite.react.config.mts   # 4173
//   node capture-oracle.ts
//
// That friction is deliberate: a baseline you can refresh from the implementation
// under test is not an oracle. `specs/visual-parity.spec.ts` diffs the native
// runtime against the committed PNGs, and the capture settings here and in the
// spec must stay identical — same viewport, same `animations: "disabled"`, same
// parked pointer — or the diff measures the capture, not the port.
// =============================================================================

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { chromium } from "@playwright/test";
import type { Page } from "@playwright/test";

const APP = "http://127.0.0.1:4173";
const OUT = path.join(import.meta.dirname, "specs", "__snapshots__");

/** Must match `visual-parity.spec.ts`. */
const VIEWPORT = { width: 1440, height: 900 } as const;

type State = "collapsed" | "expanded" | "settings" | "popup" | "markers";

const STATES: State[] = ["collapsed", "expanded", "settings", "popup", "markers"];

/** The oracle's toolbar container. Its CSS-module class names are hashed. */
function container(page: Page) {
  return page.locator("div[data-feedback-toolbar] > div").first();
}

async function reach(page: Page, state: State): Promise<void> {
  if (state === "collapsed") return;

  await container(page).click();
  // The 400 ms morph plus the 750 ms entrance have to settle first.
  await page.waitForTimeout(600);
  if (state === "expanded") return;

  if (state === "settings") {
    // The oracle's buttons carry no accessible name — only a sibling tooltip
    // span — so the gear is addressed through that span's parent wrapper.
    await page.getByText("Settings", { exact: true }).locator("xpath=../button").click();
    await page.waitForTimeout(600);
    return;
  }

  if (state === "popup") {
    await page.locator("#page-card-title").click();
    await page.waitForTimeout(600);
    return;
  }

  await page.locator("#page-card-title").click();
  await page.waitForTimeout(400);
  await page
    .locator("[data-annotation-popup]")
    .locator("textarea")
    .pressSequentially("parity marker");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(900);
}

async function shoot(page: Page): Promise<Buffer> {
  // Park the pointer somewhere inert: a hovered marker or control shows a
  // tooltip, and "wherever the last click left the mouse" is not a state.
  await page.mouse.move(700, 40);
  await page.waitForTimeout(300);
  return page.screenshot({ animations: "disabled", caret: "hide", scale: "css" });
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: VIEWPORT });
await fs.mkdir(OUT, { recursive: true });

const geometry: Record<string, { x: number; y: number; width: number; height: number }> = {};

for (const state of STATES) {
  const page = await context.newPage();
  await page.goto(`${APP}/legacy.html`);
  await page.waitForFunction(() => window.__harness !== undefined);
  await reach(page, state);

  const file = path.join(OUT, `oracle-${state}.png`);
  await fs.writeFile(file, await shoot(page));

  if (state === "collapsed" || state === "expanded") {
    const box = await container(page).boundingBox();
    if (!box) throw new Error(`no toolbar box in the ${state} state`);
    geometry[state] = {
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: Math.round(box.width),
      height: Math.round(box.height),
    };
  }

  console.log(`captured oracle-${state}.png`);
  await page.close();
}

await fs.writeFile(
  path.join(OUT, "oracle-geometry.json"),
  `${JSON.stringify({ viewport: VIEWPORT, container: geometry }, null, 2)}\n`,
);
console.log("captured oracle-geometry.json", JSON.stringify(geometry));

await browser.close();

// =============================================================================
// Playwright configuration — Agentation E2E
// =============================================================================
//
// Lives beside the fixtures rather than at the package root so the whole harness
// (pages, servers, specs, snapshots) is one self-contained directory:
// `playwright test --config e2e/playwright.config.ts`.
//
// Three projects. Chromium is the exact oracle for anything pixel- or
// engine-timing-sensitive — visual parity and animation freeze run there only,
// because Firefox and WebKit render the toolbar differently by definition and
// their `Document.getAnimations`/media semantics differ. Lifecycle, annotation
// flow, copy/submit, keyboard and Solid specs run on all three: those are
// behaviour contracts and must hold everywhere.
// =============================================================================

import * as fs from "node:fs";
import * as path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Playwright transpiles this config to CJS (the package is not `type: module`),
// so `__dirname` is the portable way to anchor paths here.
const HERE = __dirname;

export const REACT_APP = "http://127.0.0.1:4173";
export const SOLID_APP = "http://127.0.0.1:4174";
export const PROTOCOL = "http://127.0.0.1:4175";

/**
 * Playwright's bundled WebKit links against libraries this host does not ship
 * (icu74, libxml2.so.2, …). When a local prefix has been staged, put it on the
 * loader path; otherwise leave the environment alone and let WebKit report its
 * own failure rather than hiding it.
 */
const WEBKIT_LIBS = path.join(
  process.env.HOME ?? "",
  ".cache",
  "pw-webkit-libs",
  "lib",
);
if (fs.existsSync(WEBKIT_LIBS)) {
  process.env.LD_LIBRARY_PATH = process.env.LD_LIBRARY_PATH
    ? `${process.env.LD_LIBRARY_PATH}:${WEBKIT_LIBS}`
    : WEBKIT_LIBS;
}

/** Specs that only mean something on the Chromium oracle. */
const CHROMIUM_ONLY = ["**/visual-parity.spec.ts", "**/freeze.spec.ts"];

export default defineConfig({
  testDir: path.join(HERE, "specs"),
  outputDir: path.join(HERE, "test-results"),
  snapshotPathTemplate: "{testDir}/__snapshots__/{arg}{ext}",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["json", { outputFile: path.join(HERE, "results.json") }]] : [["list"]],

  use: {
    baseURL: REACT_APP,
    // Fixed viewport: the fixture body is 900 px wide and the toolbar anchors to
    // the bottom-right, so both must sit at stable coordinates.
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    trace: "retain-on-failure",
    // Every localStorage-scoped spec starts from a clean origin.
    storageState: undefined,
  },

  expect: {
    timeout: 7000,
    toHaveScreenshot: {
      // Animations are frozen for the shot only: the freeze spec needs them
      // running, and disabling them globally would make it vacuous.
      animations: "disabled",
      caret: "hide",
      scale: "css",
    },
    toMatchSnapshot: { threshold: 0.2 },
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        // Chromium refuses `navigator.clipboard.writeText` without the granted
        // permission even under a user gesture, and the runtime treats that
        // rejection as a recoverable clipboard error. Firefox and WebKit allow
        // the write on user activation and reject `grantPermissions` for these
        // names, so the grant is Chromium-only.
        permissions: ["clipboard-read", "clipboard-write"],
      },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"], viewport: { width: 1440, height: 900 } },
      testIgnore: CHROMIUM_ONLY,
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"], viewport: { width: 1440, height: 900 } },
      testIgnore: CHROMIUM_ONLY,
    },
  ],

  webServer: [
    {
      command: "node protocol-server.ts",
      cwd: HERE,
      url: `${PROTOCOL}/health`,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "node ../node_modules/vite/bin/vite.js --config vite.react.config.mts",
      cwd: HERE,
      url: `${REACT_APP}/browser.html`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "node ../node_modules/vite/bin/vite.js --config vite.solid.config.mts",
      cwd: HERE,
      url: `${SOLID_APP}/solid.html`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});

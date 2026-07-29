// =============================================================================
// React fixture app — port 4173
// =============================================================================
//
// Serves three pages that all render the same fixture DOM:
//
//   /browser.html           the native runtime via `mountAgentation`, no framework
//   /browser-route-b.html   the same native page on a second pathname
//   /react.html             the root React lifecycle adapter
//
// The legacy `PageFeedbackToolbarCSS` oracle used to be served here too. It is
// now frozen to `specs/__snapshots__/oracle-*.png`; see `capture-oracle.ts`.
//
// Isolated from the Solid fixture on purpose: `solid-devtools` instruments every
// `.tsx` client transform, so a shared server would contaminate the oracle.
// =============================================================================

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import {
  agentationDefines,
  agentationSourceAlias,
  shadowScssInline,
} from "./vite.shared.mts";

export default defineConfig({
  root: import.meta.dirname,
  // `agentation` resolves to source, so the specs need no packing or build step.
  define: agentationDefines(),
  resolve: { alias: agentationSourceAlias() },
  plugins: [
    shadowScssInline(),
    // Default `include` is enough: every `.tsx` the React page pulls in now lives
    // inside the fixture directory. The wider pattern was only needed to reach
    // the legacy oracle's `../src/components/**/*.tsx`.
    react(),
  ],
  server: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
    // `../src` and the workspace `node_modules` are both outside the root.
    fs: { allow: [".."] },
  },
});

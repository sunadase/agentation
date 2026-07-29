// =============================================================================
// Solid fixture app — port 4174
// =============================================================================
//
// Serves `/solid.html`, which mounts `Agentation` from `agentation/solid`.
//
// `agentationSolidMetadata()` must run BEFORE `vite-plugin-solid`: it is the
// Solid Devtools compiler pass that stamps `data-source-loc` onto native JSX
// elements, and the Solid transform has to see the instrumented tree.
// =============================================================================

import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { agentationSolidMetadata } from "../src/solid-vite";
import {
  agentationDefines,
  agentationSourceAlias,
  shadowScssInline,
} from "./vite.shared.mts";

export default defineConfig({
  root: import.meta.dirname,
  define: agentationDefines(),
  resolve: { alias: agentationSourceAlias() },
  plugins: [shadowScssInline(), agentationSolidMetadata(), solid()],
  server: {
    host: "127.0.0.1",
    port: 4174,
    strictPort: true,
    fs: { allow: [".."] },
  },
});

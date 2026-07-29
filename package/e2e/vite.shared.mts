// =============================================================================
// Shared Vite wiring for the fixture apps
// =============================================================================

import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";
import type { Alias, Plugin } from "vite";

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const PACKAGE = path.resolve(HERE, "..");
const SRC = path.join(PACKAGE, "src");

/**
 * `__VERSION__` is a build-time define in `tsup.config.ts`. The fixtures compile
 * the same source without tsup, so they have to supply it from the same place
 * the build does — otherwise the runtime throws on its first settings render.
 */
export function agentationDefines(): Record<string, string> {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(PACKAGE, "package.json"), "utf8"),
  ) as { version: string };
  return { __VERSION__: JSON.stringify(manifest.version) };
}

/**
 * Resolves the `agentation` public subpaths to the local `src/` tree.
 *
 * Source rather than `dist/`: the fixtures then need no build step, so the
 * behaviour specs run against the same TypeScript the unit tests do and cannot
 * be silenced by a stale or half-rebuilt `dist/`. Whether the *published*
 * artifacts resolve, export the right names and keep the framework graphs
 * separate is a packaging question, and `scripts/verify-artifacts.mjs` already
 * answers it against the real build output.
 *
 * Order matters — Vite treats a string `find` as a prefix, so the bare
 * specifier is anchored with a regex and the subpaths come first.
 */
export function agentationSourceAlias(): Alias[] {
  return [
    { find: "agentation/browser", replacement: path.join(SRC, "browser.ts") },
    { find: "agentation/react/ui", replacement: path.join(SRC, "react-ui.ts") },
    { find: "agentation/solid/vite", replacement: path.join(SRC, "solid-vite.ts") },
    { find: "agentation/solid", replacement: path.join(SRC, "solid.ts") },
    { find: "agentation/metadata/react", replacement: path.join(SRC, "metadata", "react.ts") },
    { find: "agentation/metadata/solid", replacement: path.join(SRC, "metadata", "solid.ts") },
    { find: /^agentation$/, replacement: path.join(SRC, "index.ts") },
  ];
}

/**
 * `*.shadow.scss` must compile to a CSS *string* and never reach the document.
 *
 * The build does this with a tsup plugin. Vite's default for a plain stylesheet
 * import is the opposite: it injects a `<style>` into `<head>`. That would leak
 * the whole toolbar stylesheet into the host page and make the Shadow-DOM
 * isolation specs pass for the wrong reason. `?inline` gives the compiled text
 * with no side effect, which is exactly the tsup behaviour.
 */
export function shadowScssInline(): Plugin {
  return {
    name: "agentation-shadow-scss-inline",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!source.endsWith(".shadow.scss")) return null;
      const resolved = await this.resolve(source, importer, {
        ...options,
        skipSelf: true,
      });
      return resolved ? `${resolved.id}?inline` : null;
    },
  };
}

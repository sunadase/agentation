import { transformAsync, types as t } from "@babel/core";
import type { PluginOption } from "vite";

export type AgentationSolidMetadataOptions = {
  /** Add source locations to native JSX elements. Defaults to true. */
  jsxLocation?: boolean;
};

/**
 * Dev-server-only JSX instrumentation used by the Solid metadata adapter.
 * Works with both Solid compiler versions without a devtools runtime. The
 * Agentation toolbar still works without it and degrades to DOM selectors and
 * accessibility metadata.
 *
 * This only promises source file/line/column for native JSX elements. Component
 * paths must come from `SolidMetadataOptions.resolve` or an app-emitted
 * `componentAttribute`.
 */
export function agentationSolidMetadata(
  options: AgentationSolidMetadataOptions = {},
): PluginOption {
  let enabled = false;

  return {
    name: "agentation-solid-metadata",
    enforce: "pre",
    apply: "serve",
    configResolved(config) {
      enabled =
        options.jsxLocation !== false &&
        config.command === "serve" &&
        !config.isProduction &&
        !config.build.ssr;
    },
    async transform(code, id, transformOptions) {
      if (!enabled || transformOptions?.ssr) return;

      const filename = id.split(/[?#]/, 1)[0];
      if (
        !/\.[jt]sx$/.test(filename) ||
        /(^|[/\\])node_modules([/\\]|$)/.test(filename) ||
        id.startsWith("\0") ||
        /[?&](?:raw|url)(?:[=&]|$)/.test(id)
      ) {
        return;
      }

      let changed = false;
      const result = await transformAsync(code, {
        filename,
        sourceFileName: filename,
        babelrc: false,
        configFile: false,
        sourceMaps: true,
        parserOpts: {
          plugins: filename.endsWith(".tsx") ? ["jsx", "typescript"] : ["jsx"],
        },
        plugins: [
          {
            visitor: {
              JSXOpeningElement(path) {
                const { node } = path;
                if (
                  !t.isJSXIdentifier(node.name) ||
                  !/^[a-z]/.test(node.name.name) ||
                  !node.loc ||
                  node.attributes.some(
                    (attribute) =>
                      t.isJSXAttribute(attribute) &&
                      t.isJSXIdentifier(attribute.name, { name: "data-source-loc" }),
                  )
                ) {
                  return;
                }

                const { line, column } = node.loc.start;
                // A spread can supply app-owned metadata too; let it win.
                node.attributes.unshift(
                  t.jsxAttribute(
                    t.jsxIdentifier("data-source-loc"),
                    t.stringLiteral(`${filename}:${line}:${column + 1}`),
                  ),
                );
                changed = true;
              },
            },
          },
        ],
      });

      if (!changed || !result?.code) return;
      return { code: result.code, map: result.map };
    },
  };
}

export default agentationSolidMetadata;

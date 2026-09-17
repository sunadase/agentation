"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/solid-vite.ts
var solid_vite_exports = {};
__export(solid_vite_exports, {
  agentationSolidMetadata: () => agentationSolidMetadata,
  default: () => solid_vite_default
});
module.exports = __toCommonJS(solid_vite_exports);
var import_core = require("@babel/core");
function agentationSolidMetadata(options = {}) {
  let enabled = false;
  return {
    name: "agentation-solid-metadata",
    enforce: "pre",
    apply: "serve",
    configResolved(config) {
      enabled = options.jsxLocation !== false && config.command === "serve" && !config.isProduction && !config.build.ssr;
    },
    async transform(code, id, transformOptions) {
      if (!enabled || transformOptions?.ssr) return;
      const filename = id.split(/[?#]/, 1)[0];
      if (!/\.[jt]sx$/.test(filename) || /(^|[/\\])node_modules([/\\]|$)/.test(filename) || id.startsWith("\0") || /[?&](?:raw|url)(?:[=&]|$)/.test(id)) {
        return;
      }
      let changed = false;
      const result = await (0, import_core.transformAsync)(code, {
        filename,
        sourceFileName: filename,
        babelrc: false,
        configFile: false,
        sourceMaps: true,
        parserOpts: {
          plugins: filename.endsWith(".tsx") ? ["jsx", "typescript"] : ["jsx"]
        },
        plugins: [
          {
            visitor: {
              JSXOpeningElement(path) {
                const { node } = path;
                if (!import_core.types.isJSXIdentifier(node.name) || !/^[a-z]/.test(node.name.name) || !node.loc || node.attributes.some(
                  (attribute) => import_core.types.isJSXAttribute(attribute) && import_core.types.isJSXIdentifier(attribute.name, { name: "data-source-loc" })
                )) {
                  return;
                }
                const { line, column } = node.loc.start;
                node.attributes.unshift(
                  import_core.types.jsxAttribute(
                    import_core.types.jsxIdentifier("data-source-loc"),
                    import_core.types.stringLiteral(`${filename}:${line}:${column + 1}`)
                  )
                );
                changed = true;
              }
            }
          }
        ]
      });
      if (!changed || !result?.code) return;
      return { code: result.code, map: result.map };
    }
  };
}
var solid_vite_default = agentationSolidMetadata;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  agentationSolidMetadata
});
//# sourceMappingURL=solid-vite.js.map
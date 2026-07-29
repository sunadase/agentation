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

// src/solid.ts
var solid_exports = {};
__export(solid_exports, {
  Agentation: () => Agentation,
  createSolidMetadataAdapter: () => createSolidMetadataAdapter,
  defineAgentationElement: () => import_runtime2.defineAgentationElement,
  mountAgentation: () => import_runtime2.mountAgentation
});
module.exports = __toCommonJS(solid_exports);
var import_solid_js = require("solid-js");
var import_runtime = require("agentation/browser");

// src/metadata/solid.ts
function parseSourceLocation(value) {
  if (!value) return void 0;
  const match = /^(.*):(\d+):(\d+)$/.exec(value);
  if (!match) return { file: value };
  return {
    file: match[1],
    line: Number(match[2]),
    column: Number(match[3])
  };
}
function createSolidMetadataAdapter(options = {}) {
  const sourceAttribute = options.sourceAttribute ?? "data-source-loc";
  const componentAttribute = options.componentAttribute ?? "data-agentation-solid-components";
  return {
    id: "solid",
    inspect(element, _context) {
      const resolved = options.resolve?.(element);
      if (resolved) return resolved;
      const exactSource = element.getAttribute(sourceAttribute);
      const sourceOwner = exactSource ? element : element.closest(`[${sourceAttribute}]`);
      const componentOwner = element.closest(`[${componentAttribute}]`);
      const componentValue = componentOwner?.getAttribute(componentAttribute)?.trim();
      const source = parseSourceLocation(sourceOwner?.getAttribute(sourceAttribute) ?? null);
      const componentPath = componentValue ? componentValue.split(">").map((name) => name.trim()).filter(Boolean) : void 0;
      if (!source && !componentPath?.length) return void 0;
      return {
        source,
        componentPath,
        confidence: exactSource ? "exact" : "nearest"
      };
    }
  };
}

// src/solid.ts
var import_runtime2 = require("agentation/browser");
function Agentation(props = {}) {
  let controller;
  let disposed = false;
  let latest = {};
  let defaultMetadata;
  (0, import_solid_js.createEffect)(() => {
    const { class: className, ...config } = props;
    latest = {
      ...config,
      className: className ?? config.className,
      metadata: config.metadata ?? (defaultMetadata ?? (defaultMetadata = [createSolidMetadataAdapter()]))
    };
    controller?.configure(latest);
  });
  (0, import_solid_js.onMount)(() => {
    if (disposed) return;
    controller = (0, import_runtime.mountAgentation)(document, latest);
  });
  (0, import_solid_js.onCleanup)(() => {
    disposed = true;
    controller?.destroy();
  });
  return null;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Agentation,
  createSolidMetadataAdapter,
  defineAgentationElement,
  mountAgentation
});
//# sourceMappingURL=solid.js.map
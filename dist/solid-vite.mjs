// src/solid-vite.ts
import solidDevtools from "solid-devtools/vite";
function agentationSolidMetadata(options = {}) {
  return solidDevtools({
    locator: {
      key: false,
      jsxLocation: options.jsxLocation ?? true,
      componentLocation: false
    }
  });
}
var solid_vite_default = agentationSolidMetadata;
export {
  agentationSolidMetadata,
  solid_vite_default as default
};
//# sourceMappingURL=solid-vite.mjs.map
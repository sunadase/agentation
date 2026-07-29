import solidDevtools from "solid-devtools/vite";
import type { PluginOption } from "vite";

export type AgentationSolidMetadataOptions = {
  /** Add source locations to native JSX elements. Defaults to true. */
  jsxLocation?: boolean;
};

/**
 * Dev-server-only Solid compiler instrumentation used by the Solid metadata
 * adapter. The Agentation toolbar still works without it and degrades to DOM
 * selectors and accessibility metadata.
 *
 * This only promises source file/line/column for native JSX elements. Automatic
 * Solid *component ancestry* is deliberately NOT promised: Solid Devtools
 * exposes no stable public DOM-to-owner registry, so component paths must come
 * from `SolidMetadataOptions.resolve` or an app-emitted `componentAttribute`.
 */
export function agentationSolidMetadata(
  options: AgentationSolidMetadataOptions = {},
): PluginOption {
  return solidDevtools({
    locator: {
      key: false,
      jsxLocation: options.jsxLocation ?? true,
      componentLocation: false,
    },
  });
}

export default agentationSolidMetadata;

import { PluginOption } from 'vite';

type AgentationSolidMetadataOptions = {
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
declare function agentationSolidMetadata(options?: AgentationSolidMetadataOptions): PluginOption;

export { type AgentationSolidMetadataOptions, agentationSolidMetadata, agentationSolidMetadata as default };

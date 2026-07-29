import { A as AgentationConfig, a as AgentationController } from './types-C4WpFlyO.mjs';
export { b as AgentationElement, c as AgentationEvent, d as AgentationEventDetail, e as Annotation, D as DemoAnnotation, E as ElementMetadata, f as ElementMetadataAdapter, F as FrameworkMetadata, O as OutputDetailLevel, S as SourceLocation } from './types-C4WpFlyO.mjs';

declare function defineAgentationElement(realm?: Window): CustomElementConstructor | undefined;
declare function mountAgentation(document: Document, config?: AgentationConfig): AgentationController;

export { AgentationConfig, AgentationController, defineAgentationElement, mountAgentation };

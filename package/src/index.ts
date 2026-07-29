// =============================================================================
// Agentation
// =============================================================================
//
// A floating toolbar for annotating web pages and collecting structured feedback
// for AI coding agents.
//
// Usage:
//   import { Agentation } from 'agentation';
//   <Agentation />
//
// =============================================================================

// React compatibility wrapper. The toolbar itself is a framework-neutral
// custom element mounted and cleaned up by this lifecycle adapter.
export { Agentation, PageFeedbackToolbarCSS } from "./react";
export type { AgentationProps, DemoAnnotation } from "./react";

// Framework-neutral browser interface
export { defineAgentationElement, mountAgentation } from "./browser/runtime";
export type {
  AgentationConfig,
  AgentationController,
  AgentationElement,
  AgentationEvent,
  AgentationEventDetail,
  ElementMetadata,
  ElementMetadataAdapter,
} from "./browser/types";
export { createReactMetadataAdapter } from "./metadata/react";

// React-only presentational helpers (`AnnotationPopupCSS`, the icon set) moved
// to the `agentation/react/ui` subpath in 4.0 so that importing the toolbar
// never pulls React-rendered UI into the graph.

// Utilities (for building custom UIs)
export {
  identifyElement,
  identifyAnimationElement,
  getElementPath,
  getNearbyText,
  getElementClasses,
  // Shadow DOM support
  isInShadowDOM,
  getShadowHost,
  closestCrossingShadow,
} from "./utils/element-identification";

export {
  loadAnnotations,
  saveAnnotations,
  getStorageKey,
} from "./utils/storage";

// Types
export type {
  Annotation,
  FrameworkMetadata,
  OutputDetailLevel,
  SourceLocation,
} from "./types";

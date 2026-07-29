// =============================================================================
// Agentation — React UI
// =============================================================================
//
// React-only presentational helpers for building custom annotation UIs.
//
// Split out of the root entry in 4.0. These render with React, but the product
// runtime does not: the toolbar is a framework-neutral custom element. Keeping
// them here means a consumer who only wants an icon does not pull the runtime
// in, and `agentation`/`agentation/browser` stay free of React-rendered UI.
//
// Nothing in this entry may import the runtime (`./browser/*`) — the release
// gate in `scripts/verify-artifacts.mjs` enforces that.
//
// Usage:
//   import { AnnotationPopupCSS, IconCheck } from 'agentation/react/ui';
//
// =============================================================================

export { AnnotationPopupCSS } from "./components/annotation-popup-css";
export type {
  AnnotationPopupCSSProps,
  AnnotationPopupCSSHandle,
} from "./components/annotation-popup-css";

// Icons are pure SVG React components.
export * from "./components/icons";

// =============================================================================
// Annotation Targeting
// =============================================================================
//
// Turns a pointer position, a modifier-click selection, or a drag rectangle into
// the annotation payload the runtime stores. This is the only place that decides
// *what* was annotated; the runtime owns gesture recognition and the view owns
// presentation.
//
// Behaviour is ported from the original React toolbar
// (`src/components/page-toolbar-css/index.tsx`): its `deepElementFromPoint`,
// `isElementFixed`, `identifyElementWithReact`, click handler,
// `createMultiSelectPendingAnnotation`, and drag `mouseup` handler. The exact
// coordinate spaces, string shapes, and thresholds below are that oracle's.
//
// Nothing here touches a realm global: every window/document/style lookup goes
// through the `RuntimeEnvironment` that owns the custom element.
// =============================================================================

import type { Annotation, OutputDetailLevel } from "../types";
import {
  closestCrossingShadow,
  getAccessibilityInfo,
  getDetailedComputedStyles,
  getElementClasses,
  getForensicComputedStyles,
  getFullElementPath,
  getNearbyElements,
  getNearbyText,
  identifyElement,
} from "../utils/element-identification";
import type { RuntimeEnvironment } from "./environment";
import type { ElementMetadataAdapter, ElementMetadataContext } from "./types";
import type { Box, CollectedTarget } from "./view/model";

/** Every node the native runtime creates carries this attribute. */
const AGENTATION_UI_SELECTOR = "[data-agentation-ui]";

/** Captured page selection is trimmed to this length, as in the original. */
const MAX_SELECTED_TEXT = 500;

/** Names listed before the `+N more` suffix of a multi-select label. */
const MAX_LISTED_NAMES = 5;

/** An empty drag region below this size is a click, not an area annotation. */
const MIN_AREA_SIZE = 20;

export type TargetContext = {
  readonly environment: RuntimeEnvironment;
  /** The `<agentation-overlay>` element, excluded from every page query. */
  readonly host: Element;
  readonly adapters: readonly ElementMetadataAdapter[];
  readonly metadataEnabled: boolean;
  readonly outputDetail: OutputDetailLevel;
  readonly onMetadataError: (adapterId: string, cause: unknown) => void;
};

// -----------------------------------------------------------------------------
// Hit testing
// -----------------------------------------------------------------------------

/**
 * True for the overlay host and anything it owns, in the page tree or inside
 * the shadow root. `contains` stops at shadow boundaries, so the attribute
 * lookup crosses them.
 */
function isAgentationNode(element: Element, context: TargetContext): boolean {
  const { host } = context;
  if (element === host || host.contains(element)) return true;
  return closestCrossingShadow(element, AGENTATION_UI_SELECTOR) !== null;
}

/**
 * The topmost page element at a point. When Agentation UI is on top we walk the
 * full hit list instead of giving up, so a click landing on a marker's padding
 * still annotates the page beneath it.
 */
function pageElementFromPoint(x: number, y: number, context: TargetContext): Element | null {
  const root = context.environment.document;
  const top = root.elementFromPoint(x, y);
  if (top && !isAgentationNode(top, context)) return top;
  if (!top) return null;
  for (const candidate of root.elementsFromPoint(x, y)) {
    if (!isAgentationNode(candidate, context)) return candidate;
  }
  return null;
}

/**
 * Recursively pierces open shadow roots to find the deepest element at a point;
 * `elementFromPoint` stops at shadow hosts. Closed roots are invisible here, so
 * the walk simply ends at the host, and Agentation UI is never returned.
 */
export function deepElementFromPoint(
  x: number,
  y: number,
  context: TargetContext,
): HTMLElement | null {
  let element = pageElementFromPoint(x, y, context);
  if (!element) return null;

  while (element.shadowRoot) {
    const deeper = element.shadowRoot.elementFromPoint(x, y);
    if (!deeper || deeper === element) break;
    if (isAgentationNode(deeper, context)) break;
    element = deeper;
  }

  // The original cast unconditionally: SVG and other non-HTML elements are
  // annotated as-is, and every helper below tolerates them.
  return element as HTMLElement;
}

/**
 * True when the element or any ancestor up to `<body>` is taken out of document
 * flow, in which case markers and boxes stay in viewport coordinates.
 */
export function isElementFixed(element: HTMLElement, context: TargetContext): boolean {
  const { environment } = context;
  const body = environment.document.body;
  let current: Element | null = element;
  while (current && current !== body) {
    const position = environment.computedStyle(current).position;
    if (position === "fixed" || position === "sticky") return true;
    current = current.parentElement;
  }
  return false;
}

// -----------------------------------------------------------------------------
// Geometry
// -----------------------------------------------------------------------------

/** A viewport rect in annotation space: document-relative unless fixed. */
function toAnnotationBox(rect: DOMRect, environment: RuntimeEnvironment, fixed: boolean): Box {
  return {
    x: rect.left,
    y: fixed ? rect.top : rect.top + environment.scrollY,
    width: rect.width,
    height: rect.height,
  };
}

// -----------------------------------------------------------------------------
// Element description
// -----------------------------------------------------------------------------

/** The per-element slice shared by single, group, and edit-time collection. */
type ElementDetails = Pick<
  CollectedTarget,
  | "nearbyText"
  | "cssClasses"
  | "nearbyElements"
  | "computedStyles"
  | "computedStylesObject"
  | "fullPath"
  | "accessibility"
  | "framework"
  | "reactComponents"
  | "sourceFile"
>;

/**
 * First adapter with an answer wins. A throwing adapter is reported once and
 * the next one still gets its turn: metadata is never load-bearing.
 */
function inspectMetadata(
  element: HTMLElement,
  context: TargetContext,
): Annotation["framework"] {
  if (!context.metadataEnabled) return undefined;
  if (context.adapters.length === 0) return undefined;
  const metadataContext: ElementMetadataContext = { outputDetail: context.outputDetail };
  for (const adapter of context.adapters) {
    try {
      const result = adapter.inspect(element, metadataContext);
      if (!result) continue;
      return {
        name: result.framework || adapter.id,
        // Copied out so a consumer holding the annotation cannot reach into
        // adapter-owned arrays or objects.
        componentPath: result.componentPath ? [...result.componentPath] : undefined,
        source: result.source ? { ...result.source } : undefined,
        confidence: result.confidence,
      };
    } catch (cause) {
      context.onMetadataError(adapter.id, cause);
    }
  }
  return undefined;
}

/** `file:line:column`, dropping the parts the adapter could not resolve. */
function sourceString(framework: Annotation["framework"]): string | undefined {
  const source = framework?.source;
  if (!source) return undefined;
  return [source.file, source.line, source.column]
    .filter((part) => part !== undefined)
    .join(":");
}

function describeElement(element: HTMLElement, context: TargetContext): ElementDetails {
  const framework = inspectMetadata(element, context);
  return {
    nearbyText: getNearbyText(element),
    cssClasses: getElementClasses(element),
    nearbyElements: getNearbyElements(element),
    // Two shapes on purpose: the forensic string is what the Markdown output
    // prints, the detailed object is what the popup accordion renders.
    computedStyles: getForensicComputedStyles(element),
    computedStylesObject: getDetailedComputedStyles(element),
    fullPath: getFullElementPath(element),
    accessibility: getAccessibilityInfo(element),
    framework,
    reactComponents:
      framework?.name === "react" && framework.componentPath?.length
        ? framework.componentPath.join(" > ")
        : undefined,
    sourceFile: sourceString(framework),
  };
}

/**
 * The label shown in the popup and markers. The component path prefixes the DOM
 * name; `elementPath` stays the pure DOM path.
 */
function displayName(elementName: string, componentPath: readonly string[] | undefined): string {
  if (!componentPath || componentPath.length === 0) return elementName;
  return `${componentPath.join(" ")} ${elementName}`;
}

// -----------------------------------------------------------------------------
// Collection
// -----------------------------------------------------------------------------

/** Everything a single annotated element contributes, anchored at the pointer. */
export function collectTarget(
  element: HTMLElement,
  clientX: number,
  clientY: number,
  context: TargetContext,
): CollectedTarget {
  const { environment } = context;
  const details = describeElement(element, context);
  const { name, path } = identifyElement(element);
  const fixed = isElementFixed(element, context);
  const selected = environment.getSelectionText().trim();

  return {
    x: (clientX / environment.innerWidth) * 100,
    y: fixed ? clientY : clientY + environment.scrollY,
    element: displayName(name, details.framework?.componentPath),
    elementPath: path,
    selectedText: selected.length > 0 ? selected.slice(0, MAX_SELECTED_TEXT) : undefined,
    boundingBox: toAnnotationBox(element.getBoundingClientRect(), environment, fixed),
    isFixed: fixed,
    ...details,
  };
}

/**
 * A drag or modifier selection of real elements. The marker anchors to the last
 * element (the most recent click), while forensic data comes from the first —
 * exactly as the original did. A single element degrades to a plain target so
 * multi-select presentation never appears for one hit.
 */
export function collectGroup(
  elements: readonly HTMLElement[],
  context: TargetContext,
): CollectedTarget {
  const { environment } = context;
  if (elements.length === 1) {
    const only = elements[0];
    const rect = only.getBoundingClientRect();
    return collectTarget(only, rect.left, rect.top, context);
  }

  const rects = elements.map((element) => element.getBoundingClientRect());
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));

  const names = elements
    .slice(0, MAX_LISTED_NAMES)
    .map((element) => identifyElement(element).name)
    .join(", ");
  const suffix =
    elements.length > MAX_LISTED_NAMES ? ` +${elements.length - MAX_LISTED_NAMES} more` : "";

  const last = elements[elements.length - 1];
  const lastRect = rects[rects.length - 1];
  const lastCenterX = lastRect.left + lastRect.width / 2;
  const lastCenterY = lastRect.top + lastRect.height / 2;
  const lastIsFixed = isElementFixed(last, context);

  return {
    x: (lastCenterX / environment.innerWidth) * 100,
    y: lastIsFixed ? lastCenterY : lastCenterY + environment.scrollY,
    element: `${elements.length} elements: ${names}${suffix}`,
    elementPath: "multi-select",
    boundingBox: {
      x: left,
      y: top + environment.scrollY,
      width: right - left,
      height: bottom - top,
    },
    // Individual boxes drive per-element highlighting; always document-space.
    elementBoundingBoxes: rects.map((rect) => ({
      x: rect.left,
      y: rect.top + environment.scrollY,
      width: rect.width,
      height: rect.height,
    })),
    isMultiSelect: true,
    isFixed: lastIsFixed,
    ...describeElement(elements[0], context),
  };
}

/**
 * The empty-region fallback for a drag that matched no elements. Undefined for
 * anything click-sized: the original refused to annotate a stray drag.
 *
 * The anchor is the region's far corner — the drag terminus. Callers that still
 * hold the release pointer may overwrite `x`/`y` with it.
 */
export function collectArea(rect: DOMRect, context: TargetContext): CollectedTarget | undefined {
  if (!(rect.width > MIN_AREA_SIZE && rect.height > MIN_AREA_SIZE)) return undefined;
  const { environment } = context;
  return {
    x: (rect.right / environment.innerWidth) * 100,
    y: rect.bottom + environment.scrollY,
    element: "Area selection",
    elementPath: `region at (${Math.round(rect.left)}, ${Math.round(rect.top)})`,
    boundingBox: {
      x: rect.left,
      y: rect.top + environment.scrollY,
      width: rect.width,
      height: rect.height,
    },
    isMultiSelect: true,
  };
}

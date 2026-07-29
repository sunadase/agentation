// =============================================================================
// Layout mode region
// =============================================================================
//
// Three original React views collapsed into one retained-DOM region:
//
//   * `design-mode/palette.tsx`    — the component palette anchored to the
//     toolbar, its rolling change count and its footer.
//   * `design-mode/index.tsx`      — the placement overlay (place, select,
//     move, resize, nudge, delete, text edit).
//   * `design-mode/rearrange.tsx`  — the page-rearrangement overlay (hover,
//     capture, ghost outlines, connectors, notes).
//
// They live together because the original coordinated them through four signal
// counters (`deselectSignal`, `clearSignal`, `onDragMove`, `onDragEnd`) whose
// only purpose was to keep two sibling React trees agreeing on one selection
// and one snapped drag delta. With both overlays in one module that machinery
// disappears: there is a single `selection` and a single gesture.
//
// Geometry is *not* re-derived here — `layout/geometry.ts` owns the snapping,
// resize and clamping arithmetic, and `layout/skeletons.ts` owns the wireframe
// shapes. This module owns pointer bookkeeping, DOM pooling and intents.
//
// Positioning note: the region root is `display: contents`. The original
// rendered these layers as body-level siblings with absolute z-indices (99994
// hover, 99995 overlays, 99996 draw/select/connectors, 100001 guides/indicator,
// 100002 drag preview). A `position: fixed` root would trap all of them in one
// stacking context and lift the wireframe backdrop (99994, owned by the overlay
// region) along with it.
//
// Nothing mutates page elements: applying and restoring the inline styles of
// captured sections is the runtime's job. This region only reports geometry.
// =============================================================================

import type { RuntimeEnvironment } from "../environment";
import { captureElement } from "../layout/section-detection";
import {
  HANDLE_DIRECTIONS,
  MIN_SIZE,
  SNAP_THRESHOLD,
  applyResizeSnap,
  clampToOrigin,
  computeSnap,
  constrainAspectRatio,
  edgesForHandle,
  resizeRect,
  type Box,
  type Guide,
  type HandleDir,
} from "../layout/geometry";
import { createSkeleton, updateSkeleton } from "../layout/skeletons";
import {
  COMPONENT_MAP,
  COMPONENT_REGISTRY,
  DEFAULT_SIZES,
  type ComponentType,
  type DesignPlacement,
  type DetectedSection,
  type RearrangeState,
} from "../layout/types";
import type { AgentationConfig } from "../types";
import { createIcon } from "./icons";
import type { RuntimeViewModel, ViewDispatch, ViewRegion } from "./model";

// -----------------------------------------------------------------------------
// Original constants
// -----------------------------------------------------------------------------

/** Placement / section exit animation, before the id leaves the model. */
const EXIT_MS = 180;
/** `Clear` animates everything out before the runtime empties the lists. */
const CLEAR_MS = 200;
/** Palette enter/exit, matching the settings panel. */
const PALETTE_EXIT_MS = 200;
/** Footer collapse — `grid-template-rows` transition plus its inner fade. */
const FOOTER_COLLAPSE_MS = 300;
/** Rolling digit animation. */
const ROLL_MS = 250;
/** Note/text editor exit. */
const EDITOR_EXIT_MS = 150;
/** Connector fade-out once a section returns to its original position. */
const CONNECTOR_EXIT_MS = 250;
/**
 * Sections restored already-moved animate their page elements first; the
 * original held their outlines back for this long so the two did not race.
 */
const OUTLINES_READY_MS = 380;
/** Smallest element the rearrange overlay will consider capturing. */
const MIN_CAPTURE_SIZE = 16;
/** Palette drag has to travel this far before the floating preview appears. */
const PALETTE_DRAG_THRESHOLD = 4;
/** Drag-to-place has to travel this far to produce a custom-sized placement. */
const PLACE_DRAG_THRESHOLD = 5;
/** Box selection has to travel this far to become a marquee. */
const SELECT_DRAG_THRESHOLD = 4;
/** A selection drag has to travel this far to count as a move. */
const MOVE_DRAG_THRESHOLD = 2;
/** Preview size easing runs out over this distance above the toolbar. */
const PREVIEW_RAMP = 180;
/** Arrow nudge, and its shifted variant. */
const NUDGE_STEP = 1;
const NUDGE_STEP_SHIFT = 20;
/** Trailing delay before a nudged item is reported as settled. */
const NUDGE_SYNC_MS = 300;

/** Tags the capture walk steps over rather than capturing. */
const SKIP_TAGS: Record<string, true> = {
  script: true,
  style: true,
  noscript: true,
  link: true,
  meta: true,
  br: true,
  hr: true,
};

/** Component types whose skeleton renders a caption, so double-click edits it. */
const TEXT_TYPES: Partial<Record<ComponentType, true>> = {
  text: true,
  hero: true,
  button: true,
  badge: true,
  cta: true,
  toast: true,
  modal: true,
  card: true,
  navigation: true,
  tabs: true,
  input: true,
  search: true,
  breadcrumb: true,
  pricing: true,
  testimonial: true,
  alert: true,
  banner: true,
  tag: true,
  notification: true,
  stat: true,
  productCard: true,
};

const TEXT_PLACEHOLDERS: Partial<Record<ComponentType, string>> = {
  hero: "Headline text",
  button: "Button label",
  badge: "Badge label",
  cta: "Call to action text",
  toast: "Notification message",
  modal: "Dialog title",
  card: "Card title",
  navigation: "Brand / nav items",
  tabs: "Tab labels",
  input: "Placeholder text",
  search: "Search placeholder",
  pricing: "Plan name or price",
  testimonial: "Quote text",
  alert: "Alert message",
  banner: "Banner text",
  tag: "Tag label",
  notification: "Notification message",
  stat: "Metric value",
  productCard: "Product name",
};

const PALETTE_DESCRIPTION =
  "Rearrange and resize existing elements, add new components, and explore layout ideas. Agent results may vary.";
const PALETTE_DOC_URL = "https://agentation.dev/features#layout-mode";

// -----------------------------------------------------------------------------
// Palette glyphs
// -----------------------------------------------------------------------------
//
// The original drew 66 hand-tuned 20x16 wireframe icons inline in JSX. They are
// not part of the shared icon set (which is UI chrome), so they live here as
// shape tables: one entry per SVG child, transcribed attribute for attribute.
// `S`/`SW` are the original `stroke`/`strokeWidth` defaults.

const S = "currentColor";
const SW = "0.5";

type Shape = readonly [keyof SVGElementTagNameMap, Record<string, string>, string?];

/** Stroked rect. */
function sr(x: number, y: number, w: number, h: number, rx: number, extra?: Record<string, string>): Shape {
  return ["rect", { x: `${x}`, y: `${y}`, width: `${w}`, height: `${h}`, rx: `${rx}`, stroke: S, "stroke-width": SW, ...extra }];
}

/** Filled rect. */
function fr(x: number, y: number, w: number, h: number, rx: number, opacity: string): Shape {
  return ["rect", { x: `${x}`, y: `${y}`, width: `${w}`, height: `${h}`, rx: `${rx}`, fill: S, opacity }];
}

function ln(x1: number, y1: number, x2: number, y2: number, width: string, opacity?: string): Shape {
  const attributes: Record<string, string> = {
    x1: `${x1}`,
    y1: `${y1}`,
    x2: `${x2}`,
    y2: `${y2}`,
    stroke: S,
    "stroke-width": width,
  };
  if (opacity !== undefined) attributes.opacity = opacity;
  return ["line", attributes];
}

/** Stroked circle. */
function cs(cx: number, cy: number, r: number, extra?: Record<string, string>): Shape {
  return ["circle", { cx: `${cx}`, cy: `${cy}`, r: `${r}`, stroke: S, "stroke-width": SW, ...extra }];
}

/** Filled circle. */
function cf(cx: number, cy: number, r: number, opacity: string): Shape {
  return ["circle", { cx: `${cx}`, cy: `${cy}`, r: `${r}`, fill: S, opacity }];
}

function pa(d: string, extra?: Record<string, string>): Shape {
  return ["path", { d, stroke: S, "stroke-width": SW, ...extra }];
}

function tx(x: number, y: number, content: string, extra?: Record<string, string>): Shape {
  return [
    "text",
    { x: `${x}`, y: `${y}`, "font-size": "4", fill: S, ...extra },
    content,
  ];
}

const PALETTE_GLYPHS: Record<ComponentType, readonly Shape[]> = {
  navigation: [sr(1, 4, 18, 8, 1), fr(2.5, 7, 3, 1.5, 0.5, ".4"), fr(7, 7, 2.5, 1.5, 0.5, ".25"), fr(11, 7, 2.5, 1.5, 0.5, ".25")],
  header: [sr(1, 2, 18, 12, 1), fr(3, 5.5, 8, 2, 0.5, ".35"), fr(3, 9, 12, 1, 0.5, ".15")],
  hero: [sr(1, 1, 18, 14, 1), fr(5, 5, 10, 1.5, 0.5, ".35"), fr(7, 8, 6, 1, 0.5, ".15"), sr(7.5, 10.5, 5, 2.5, 1)],
  section: [sr(1, 1, 18, 14, 1), fr(3, 4, 6, 1, 0.5, ".3"), fr(3, 6.5, 14, 1, 0.5, ".15"), fr(3, 9, 10, 1, 0.5, ".15")],
  sidebar: [sr(1, 1, 7, 14, 1), fr(2.5, 4, 4, 1, 0.5, ".3"), fr(2.5, 6.5, 3.5, 1, 0.5, ".15"), fr(2.5, 9, 4, 1, 0.5, ".15")],
  footer: [sr(1, 7, 18, 8, 1), fr(3, 9.5, 4, 1, 0.5, ".25"), fr(9, 9.5, 4, 1, 0.5, ".25"), fr(15, 9.5, 3, 1, 0.5, ".2")],
  modal: [sr(3, 2, 14, 12, 1.5), fr(5, 4.5, 7, 1, 0.5, ".3"), fr(5, 7, 10, 1, 0.5, ".15"), sr(11, 11, 5, 2, 0.75)],
  divider: [ln(2, 8, 18, 8, "0.5", ".3")],
  card: [sr(2, 1, 16, 14, 1.5), fr(2, 1, 16, 5.5, 1, ".04"), fr(4, 8.5, 8, 1, 0.5, ".25"), fr(4, 11, 11, 1, 0.5, ".12")],
  text: [fr(2, 4, 14, 1.5, 0.5, ".3"), fr(2, 7, 11, 1, 0.5, ".15"), fr(2, 9.5, 13, 1, 0.5, ".15"), fr(2, 12, 8, 1, 0.5, ".12")],
  image: [sr(2, 2, 16, 12, 1), ln(2, 2, 18, 14, ".3", ".25"), ln(18, 2, 2, 14, ".3", ".25")],
  video: [sr(2, 2, 16, 12, 1), pa("M8.5 5.5v5l4.5-2.5z", { fill: S, opacity: ".15" })],
  table: [
    sr(1, 2, 18, 12, 1),
    ln(1, 5.5, 19, 5.5, ".3", ".25"),
    ln(1, 9, 19, 9, ".3", ".25"),
    ln(7, 2, 7, 14, ".3", ".25"),
    ln(13, 2, 13, 14, ".3", ".25"),
  ],
  grid: [sr(1.5, 2, 7, 5.5, 1), sr(11.5, 2, 7, 5.5, 1), sr(1.5, 9.5, 7, 5.5, 1), sr(11.5, 9.5, 7, 5.5, 1)],
  list: [
    cs(3.5, 4.5, 1),
    fr(6.5, 4, 10, 1, 0.5, ".2"),
    cs(3.5, 8, 1),
    fr(6.5, 7.5, 8, 1, 0.5, ".2"),
    cs(3.5, 11.5, 1),
    fr(6.5, 11, 11, 1, 0.5, ".2"),
  ],
  chart: [fr(3, 9, 2.5, 4, 0.5, ".2"), fr(7, 6, 2.5, 7, 0.5, ".25"), fr(11, 3, 2.5, 10, 0.5, ".3"), fr(15, 5, 2.5, 8, 0.5, ".2")],
  accordion: [sr(1.5, 2, 17, 4, 1), fr(3, 3.5, 6, 1, 0.5, ".25"), sr(1.5, 7.5, 17, 3, 1), sr(1.5, 12, 17, 3, 1)],
  carousel: [
    sr(3, 2, 14, 10, 1),
    pa("M1.5 7L3 8.5 1.5 10", { opacity: ".35" }),
    pa("M18.5 7L17 8.5 18.5 10", { opacity: ".35" }),
    cf(8.5, 14, 0.6, ".35"),
    cf(10, 14, 0.6, ".15"),
    cf(11.5, 14, 0.6, ".15"),
  ],
  button: [sr(3, 5, 14, 6, 2), fr(6.5, 7.5, 7, 1, 0.5, ".25")],
  input: [fr(2, 4, 5.5, 1, 0.5, ".25"), sr(2, 6.5, 16, 5.5, 1), fr(3.5, 8.5, 7, 1, 0.5, ".12")],
  search: [
    sr(2, 4.5, 16, 7, 3.5),
    cs(6, 8, 2, { opacity: ".3" }),
    ln(7.5, 9.5, 9, 11, SW, ".3"),
    fr(9.5, 7.5, 6, 1, 0.5, ".12"),
  ],
  form: [
    fr(2, 1.5, 5.5, 1, 0.5, ".25"),
    sr(2, 3.5, 16, 3, 0.75),
    fr(2, 8, 7, 1, 0.5, ".25"),
    sr(2, 10, 16, 3, 0.75),
    sr(12, 14, 6, 2, 0.75),
  ],
  tabs: [sr(1, 5, 18, 10, 1), sr(1, 2, 6, 3.5, 0.75), fr(2.5, 3.25, 3, 1, 0.5, ".25"), sr(7, 2, 6, 3.5, 0.75)],
  dropdown: [
    sr(2, 2, 16, 4, 1),
    fr(3.5, 3.5, 7, 1, 0.5, ".2"),
    pa("M15 3.5l1.5 1.5L18 3.5", { opacity: ".3" }),
    sr(2, 7, 16, 7, 1, { "stroke-dasharray": "2 1", opacity: ".3" }),
  ],
  toggle: [sr(4, 5, 12, 6, 3), cf(13, 8, 2, ".3")],
  avatar: [cs(10, 8, 6), cs(10, 6.5, 2), pa("M6.5 13c0-2 1.5-3.5 3.5-3.5s3.5 1.5 3.5 3.5")],
  badge: [sr(3, 5, 14, 6, 3), fr(6, 7.5, 8, 1, 0.5, ".25")],
  breadcrumb: [
    fr(1.5, 7, 3.5, 1, 0.5, ".3"),
    pa("M6.5 7l1 1-1 1", { opacity: ".2" }),
    fr(9, 7, 3.5, 1, 0.5, ".2"),
    pa("M14 7l1 1-1 1", { opacity: ".2" }),
    fr(16.5, 7, 2, 1, 0.5, ".15"),
  ],
  pagination: [
    sr(2, 5.5, 3.5, 5, 1),
    sr(6.5, 5.5, 3.5, 5, 1),
    sr(11, 5.5, 3.5, 5, 1, { fill: S, opacity: ".15" }),
    sr(15.5, 5.5, 3.5, 5, 1),
  ],
  progress: [sr(2, 7, 16, 2, 1), fr(2, 7, 10, 2, 1, ".2")],
  toast: [sr(2, 4, 16, 8, 1.5), cs(5, 8, 1.5, { opacity: ".3" }), fr(8, 6.5, 7, 1, 0.5, ".25"), fr(8, 9, 5, 1, 0.5, ".12")],
  tooltip: [sr(3, 3, 14, 7, 1.5), fr(5.5, 5.5, 9, 1, 0.5, ".25"), pa("M9 10l1 2.5 1-2.5")],
  pricing: [
    sr(2, 1, 16, 14, 1.5),
    fr(6, 3, 8, 1.5, 0.5, ".25"),
    fr(7, 5.5, 6, 2, 0.5, ".15"),
    fr(5, 9, 10, 1, 0.5, ".1"),
    fr(5, 11, 10, 1, 0.5, ".1"),
    fr(6, 13, 8, 1.5, 0.5, ".2"),
  ],
  testimonial: [
    sr(2, 1, 16, 14, 1.5),
    tx(4, 5.5, "\u201C", { opacity: ".2", "font-family": "serif" }),
    fr(4, 7, 12, 1, 0.5, ".15"),
    fr(4, 9, 9, 1, 0.5, ".12"),
    cs(5.5, 12.5, 1.5, { opacity: ".25" }),
    fr(8, 12, 5, 1, 0.5, ".15"),
  ],
  cta: [sr(1, 2, 18, 12, 1), fr(5, 4.5, 10, 1.5, 0.5, ".3"), fr(6, 7.5, 8, 1, 0.5, ".15"), sr(7, 10, 6, 2.5, 1)],
  alert: [
    sr(2, 4, 16, 8, 1.5),
    cs(6, 8, 2, { opacity: ".3" }),
    ln(6, 7, 6, 8.5, "0.6", ".5"),
    cf(6, 9.3, 0.3, ".5"),
    fr(9.5, 7, 6, 1, 0.5, ".2"),
  ],
  banner: [sr(1, 5, 18, 6, 1), fr(4, 7.5, 8, 1, 0.5, ".25"), sr(14, 7, 3.5, 2, 0.75)],
  stat: [sr(3, 2, 14, 12, 1.5), fr(6, 4.5, 8, 1, 0.5, ".15"), fr(5, 7, 10, 2.5, 0.5, ".3"), fr(7, 11, 6, 1, 0.5, ".12")],
  stepper: [
    cs(4, 8, 2, { fill: S, opacity: ".2" }),
    ln(6, 8, 8, 8, ".4", ".3"),
    cs(10, 8, 2),
    ln(12, 8, 14, 8, ".4", ".3"),
    cs(16, 8, 2),
  ],
  tag: [
    sr(3, 5, 14, 6, 1.5),
    fr(5.5, 7.5, 6, 1, 0.5, ".25"),
    ln(14, 6.5, 15.5, 9.5, SW, ".2"),
    ln(15.5, 6.5, 14, 9.5, SW, ".2"),
  ],
  rating: [
    ["path", { d: "M4 5.5l1 2 2.2.3-1.6 1.5.4 2.2L4 10.3l-2 1.2.4-2.2L.8 7.8 3 7.5z", fill: S, opacity: ".25" }],
    ["path", { d: "M10 5.5l1 2 2.2.3-1.6 1.5.4 2.2L10 10.3l-2 1.2.4-2.2L6.8 7.8 9 7.5z", fill: S, opacity: ".25" }],
    pa("M16 5.5l1 2 2.2.3-1.6 1.5.4 2.2L16 10.3l-2 1.2.4-2.2-1.6-1.5 2.2-.3z", { opacity: ".25" }),
  ],
  map: [
    sr(2, 2, 16, 12, 1),
    ln(2, 6, 18, 10, ".3", ".15"),
    ln(7, 2, 11, 14, ".3", ".15"),
    pa("M10 5c-1.7 0-3 1.3-3 3 0 2.5 3 5 3 5s3-2.5 3-5c0-1.7-1.3-3-3-3z", { fill: S, opacity: ".15" }),
  ],
  timeline: [
    ln(5, 2, 5, 14, ".4", ".25"),
    cs(5, 4, 1.5, { fill: S, opacity: ".2" }),
    fr(8, 3, 8, 1, 0.5, ".25"),
    cs(5, 8.5, 1.5),
    fr(8, 7.5, 6, 1, 0.5, ".15"),
    cs(5, 13, 1.5),
    fr(8, 12, 7, 1, 0.5, ".15"),
  ],
  fileUpload: [
    sr(3, 2, 14, 12, 1.5, { "stroke-dasharray": "2 1" }),
    pa("M10 10V5.5m0 0L7.5 8m2.5-2.5L12.5 8", { opacity: ".3" }),
    fr(7, 11.5, 6, 1, 0.5, ".15"),
  ],
  codeBlock: [
    sr(2, 2, 16, 12, 1),
    cf(4, 4, 0.6, ".3"),
    cf(5.5, 4, 0.6, ".3"),
    cf(7, 4, 0.6, ".3"),
    fr(4, 7, 7, 1, 0.5, ".2"),
    fr(6, 9, 5, 1, 0.5, ".15"),
    fr(4, 11, 8, 1, 0.5, ".12"),
  ],
  calendar: [
    sr(2, 3, 16, 12, 1),
    ln(2, 6.5, 18, 6.5, ".4", ".25"),
    fr(5, 4, 1, 1.5, 0.3, ".2"),
    fr(14, 4, 1, 1.5, 0.3, ".2"),
    cf(7, 9, 0.6, ".2"),
    cf(10, 9, 0.6, ".2"),
    cf(13, 9, 0.6, ".3"),
    cf(7, 12, 0.6, ".2"),
    cf(10, 12, 0.6, ".2"),
  ],
  notification: [
    sr(2, 3, 16, 10, 1.5),
    cs(5.5, 8, 2, { opacity: ".25" }),
    fr(9, 6, 6, 1, 0.5, ".25"),
    fr(9, 8.5, 4.5, 1, 0.5, ".12"),
    cf(16.5, 4.5, 1.5, ".25"),
  ],
  productCard: [
    sr(3, 1, 14, 14, 1.5),
    fr(3, 1, 14, 6, 1, ".04"),
    fr(5, 8.5, 7, 1, 0.5, ".25"),
    fr(5, 10.5, 4, 1.5, 0.5, ".15"),
    sr(12, 12, 4, 2, 0.75),
  ],
  profile: [cs(10, 5, 3), fr(5, 10, 10, 1.5, 0.5, ".25"), fr(7, 12.5, 6, 1, 0.5, ".12")],
  drawer: [
    sr(9, 1, 10, 14, 1),
    fr(10.5, 4, 5, 1, 0.5, ".25"),
    fr(10.5, 6.5, 7, 1, 0.5, ".15"),
    fr(10.5, 9, 6, 1, 0.5, ".15"),
    sr(1, 1, 7, 14, 1, { opacity: ".15" }),
  ],
  popover: [sr(3, 2, 14, 9, 1.5), fr(5, 4.5, 8, 1, 0.5, ".25"), fr(5, 7, 6, 1, 0.5, ".15"), pa("M9 11l1 2.5 1-2.5")],
  logo: [sr(2, 3, 10, 10, 2), pa("M5 9.5l2-4 2 4", { opacity: ".3" }), fr(14, 6, 4, 1, 0.5, ".2"), fr(14, 8.5, 3, 1, 0.5, ".12")],
  faq: [
    tx(2.5, 5.5, "?", { opacity: ".3", "font-weight": "bold" }),
    fr(7, 3, 10, 1, 0.5, ".25"),
    fr(7, 5.5, 8, 1, 0.5, ".12"),
    tx(2.5, 11.5, "?", { opacity: ".3", "font-weight": "bold" }),
    fr(7, 9, 9, 1, 0.5, ".25"),
    fr(7, 11.5, 7, 1, 0.5, ".12"),
  ],
  gallery: [
    sr(1.5, 1.5, 5, 5, 0.75),
    sr(7.5, 1.5, 5, 5, 0.75),
    sr(13.5, 1.5, 5, 5, 0.75),
    sr(1.5, 9.5, 5, 5, 0.75),
    sr(7.5, 9.5, 5, 5, 0.75),
    sr(13.5, 9.5, 5, 5, 0.75),
  ],
  checkbox: [sr(5, 4, 8, 8, 1.5), pa("M7.5 8l1.5 1.5 3-3", { opacity: ".35" })],
  radio: [cs(10, 8, 4), cf(10, 8, 2, ".3")],
  slider: [fr(2, 7.5, 16, 1, 0.5, ".15"), fr(2, 7.5, 10, 1, 0.5, ".25"), cs(12, 8, 2.5)],
  datePicker: [
    sr(2, 1, 16, 5, 1),
    fr(3.5, 3, 5, 1, 0.5, ".2"),
    fr(14, 2.5, 2.5, 2, 0.5, ".12"),
    sr(2, 7, 16, 8, 1, { "stroke-dasharray": "2 1", opacity: ".3" }),
    cf(6, 10, 0.6, ".2"),
    cf(10, 10, 0.6, ".3"),
    cf(14, 10, 0.6, ".2"),
    cf(6, 13, 0.6, ".2"),
    cf(10, 13, 0.6, ".2"),
  ],
  skeleton: [fr(2, 2, 16, 3, 1, ".08"), fr(2, 7, 10, 2, 0.75, ".08"), fr(2, 11, 13, 2, 0.75, ".08")],
  chip: [
    sr(1.5, 5, 10, 6, 3, { fill: S, opacity: ".08" }),
    fr(4, 7.5, 4, 1, 0.5, ".25"),
    ln(9.5, 6.5, 10.5, 9.5, SW, ".2"),
    ln(10.5, 6.5, 9.5, 9.5, SW, ".2"),
    sr(13, 5, 5.5, 6, 3, { opacity: ".25" }),
  ],
  icon: [pa("M10 3l1.5 3 3.5.5-2.5 2.5.5 3.5L10 11l-3 1.5.5-3.5L5 6.5l3.5-.5z", { opacity: ".3" })],
  spinner: [
    cs(10, 8, 5, { opacity: ".12" }),
    pa("M10 3a5 5 0 0 1 5 5", { opacity: ".35", "stroke-linecap": "round" }),
  ],
  feature: [
    sr(2, 2, 5, 5, 1.5),
    pa("M4.5 3.5v3m-1.5-1.5h3", { opacity: ".25" }),
    fr(9, 2.5, 8, 1.5, 0.5, ".25"),
    fr(9, 5.5, 6, 1, 0.5, ".12"),
    sr(2, 10, 5, 5, 1.5),
    fr(9, 10.5, 7, 1.5, 0.5, ".25"),
    fr(9, 13.5, 5, 1, 0.5, ".12"),
  ],
  team: [
    cs(5, 5, 2.5),
    fr(2.5, 9, 5, 1, 0.5, ".2"),
    cs(15, 5, 2.5),
    fr(12.5, 9, 5, 1, 0.5, ".2"),
    cs(10, 5, 2.5, { opacity: ".5" }),
    fr(7.5, 9, 5, 1, 0.5, ".15"),
    fr(4, 12, 12, 1, 0.5, ".1"),
  ],
  login: [
    sr(3, 1, 14, 14, 1.5),
    fr(6, 3, 8, 1.5, 0.5, ".25"),
    sr(5, 5.5, 10, 3, 0.75),
    sr(5, 9.5, 10, 3, 0.75),
    fr(6.5, 13.5, 7, 2, 0.75, ".2"),
  ],
  contact: [
    sr(2, 1, 16, 14, 1.5),
    fr(4, 3, 5, 1, 0.5, ".2"),
    sr(4, 5, 12, 2.5, 0.75),
    sr(4, 8.5, 12, 4, 0.75),
    fr(11, 13.5, 5, 1.5, 0.5, ".2"),
  ],
};

/** The 14x14 dotted-page glyph on the wireframe toggle. */
const WIREFRAME_GLYPH: readonly Shape[] = [
  ["rect", { x: "1", y: "1", width: "12", height: "12", rx: "2", stroke: S, "stroke-width": "1" }],
  ...[4.5, 7, 9.5].flatMap((cy) => [4.5, 7, 9.5].map((cx) => cf(cx, cy, 0.8, ".6"))),
];

// The original coloured the edge-handle arrows inline (`#3c82f7`, `#f97316` in
// wireframe); here they inherit `currentColor` so the swap is one CSS rule.
const EDGE_ARROWS: Record<"n" | "e" | "s" | "w", readonly Shape[]> = {
  n: [["path", { d: "M4 0.5L1 4.5h6z", fill: "currentColor" }]],
  e: [["path", { d: "M5.5 4L1.5 1v6z", fill: "currentColor" }]],
  s: [["path", { d: "M4 5.5L1 1.5h6z", fill: "currentColor" }]],
  w: [["path", { d: "M0.5 4L4.5 1v6z", fill: "currentColor" }]],
};

const EDGE_ARROW_SIZE: Record<"n" | "e" | "s" | "w", readonly [number, number]> = {
  n: [8, 6],
  e: [6, 8],
  s: [8, 6],
  w: [6, 8],
};

// -----------------------------------------------------------------------------
// Small helpers
// -----------------------------------------------------------------------------

type Point = { x: number; y: number };

/** Union of a non-empty list of boxes. */
function unionBox(boxes: readonly Box[]): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function rectChanged(section: DetectedSection): boolean {
  const o = section.originalRect;
  const c = section.currentRect;
  return (
    Math.abs(o.x - c.x) > 1 ||
    Math.abs(o.y - c.y) > 1 ||
    Math.abs(o.width - c.width) > 1 ||
    Math.abs(o.height - c.height) > 1
  );
}

function rectMoved(section: DetectedSection): boolean {
  const o = section.originalRect;
  const c = section.currentRect;
  return Math.abs(o.x - c.x) > 1 || Math.abs(o.y - c.y) > 1;
}

function rectResized(section: DetectedSection): boolean {
  const o = section.originalRect;
  const c = section.currentRect;
  return Math.abs(o.width - c.width) > 1 || Math.abs(o.height - c.height) > 1;
}

/**
 * Re-arm a CSS animation on a retained node. React got this for free by
 * remounting the element; here the class has to leave the node and the layout
 * has to be flushed before it goes back on.
 */
function restartAnimation(node: HTMLElement): void {
  node.style.animation = "none";
  void node.offsetWidth;
  node.style.animation = "";
}

/** Write only on change, so a diff pass never dirties a stable text node. */
function setText(node: Node, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

// -----------------------------------------------------------------------------
// Pooled nodes
// -----------------------------------------------------------------------------

type PlacementNode = {
  root: HTMLDivElement;
  label: HTMLSpanElement;
  note: HTMLSpanElement;
  content: HTMLDivElement;
  skeleton: HTMLElement;
  /** Skeleton identity — a change of type or caption needs a rebuild. */
  skeletonType: ComponentType;
  skeletonText: string | undefined;
  skeletonWidth: number;
  skeletonHeight: number;
  /** Last non-empty caption, so clearing it fades the old text out. */
  lastNote: string;
};

type SectionNode = {
  root: HTMLDivElement;
  label: HTMLSpanElement;
  note: HTMLSpanElement;
  dimensions: HTMLSpanElement;
  badge: HTMLSpanElement;
  badgeText: Text;
  badgeExtra: HTMLSpanElement;
  lastNote: string;
  /** Ghost enter only plays the first time a section becomes a ghost. */
  seenGhost: boolean;
};

type ConnectorNode = {
  group: SVGGElement;
  line: SVGPathElement;
  from: SVGCircleElement;
  to: SVGCircleElement;
};

/** A section that returned to its original position, fading its connector out. */
type ExitingConnector = { from: Box; to: Box; isFixed: boolean };

// -----------------------------------------------------------------------------
// Gestures
// -----------------------------------------------------------------------------

type Gesture =
  /** Dragging a component out of the palette onto the page. */
  | { kind: "palette"; component: ComponentType; start: Point; dragged: boolean; controller: AbortController }
  /** Click-or-drag placement of the armed component. */
  | { kind: "place"; component: ComponentType; start: Point; scrollY: number; dragged: boolean; end: Point; controller: AbortController }
  /** Marquee selection on empty overlay space. */
  | { kind: "select"; start: Point; scrollY: number; additive: boolean; dragged: boolean; controller: AbortController }
  /** Moving the shared selection. */
  | {
      kind: "move";
      start: Point;
      /** Pre-drag origins, so every move recomputes from a fixed base. */
      placementOrigins: Map<string, Point>;
      sectionOrigins: Map<string, Point>;
      duplicated: boolean;
      moved: boolean;
      lastDx: number;
      lastDy: number;
      controller: AbortController;
    }
  | { kind: "resize-placement"; id: string; direction: HandleDir; start: Point; startBox: Box; controller: AbortController }
  | { kind: "resize-section"; id: string; direction: HandleDir; start: Point; startBox: Box; controller: AbortController };

// -----------------------------------------------------------------------------
// Region
// -----------------------------------------------------------------------------

export function createLayoutRegion(
  environment: RuntimeEnvironment,
  dispatch: ViewDispatch,
): ViewRegion {
  const controller = new environment.AbortController();
  const { signal } = controller;
  const timers = new Set<number>();

  function later(handler: () => void, delay: number): number {
    const handle = environment.timers.setTimeout(() => {
      timers.delete(handle);
      handler();
    }, delay);
    timers.add(handle);
    return handle;
  }

  function cancel(handle: number | undefined): void {
    if (handle === undefined) return;
    timers.delete(handle);
    environment.timers.clearTimeout(handle);
  }

  function button(className: string, label?: string): HTMLButtonElement {
    const node = environment.createElement("button", className);
    node.type = "button";
    if (label !== undefined) node.setAttribute("aria-label", label);
    return node;
  }

  function glyph(shapes: readonly Shape[], width: number, height: number): SVGSVGElement {
    const svg = environment.createSvg("svg", {
      viewBox: `0 0 ${width} ${height}`,
      width: `${width}`,
      height: `${height}`,
      fill: "none",
      "aria-hidden": "true",
      focusable: "false",
    });
    for (const [tag, attributes, content] of shapes) {
      const child = environment.createSvg(tag, attributes);
      if (content !== undefined) child.textContent = content;
      svg.appendChild(child);
    }
    return svg;
  }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  let model: RuntimeViewModel | null = null;

  /**
   * Render source. Refreshed from the model on every `update()` unless a
   * gesture owns it, in which case this region is the authority until release.
   */
  let placements: DesignPlacement[] = [];
  let rearrange: RearrangeState | null = null;

  /** One selection across both overlays — the original's four signals in one. */
  const selection = { placements: new Set<string>(), sections: new Set<string>() };

  const exitingPlacements = new Set<string>();
  const exitingSections = new Set<string>();

  let gesture: Gesture | null = null;
  let guides: readonly Guide[] = [];
  let hoverBox: Box | null = null;
  let sizeIndicator: { x: number; y: number; text: string } | null = null;
  let drawBox: Box | null = null;
  let selectBox: Box | null = null;
  /** Live translate applied to dragged section outlines (commit happens on release). */
  let sectionDragDelta: Point | null = null;

  let outlinesReady = true;
  let outlinesReadyTimer: number | undefined;
  const firstAction = new Map<string, "move" | "resize">();
  let previousChangedIds = new Set<string>();
  const lastChangedRects = new Map<string, { current: Box; original: Box; isFixed: boolean }>();
  const exitingConnectors = new Map<string, ExitingConnector>();

  let nudgeSyncTimer: number | undefined;

  type EditorState = { target: "placement" | "section"; id: string; hadText: boolean; exiting: boolean };
  let editor: EditorState | null = null;
  let editorExitTimer: number | undefined;

  let paletteMounted = false;
  let paletteExitTimer: number | undefined;
  let paletteEnterFrame: number | undefined;

  let footerVisible = false;
  let footerCollapsed = true;
  let footerHideTimer: number | undefined;
  let lastFooterCount = 0;
  let lastFooterSuffix = "";
  let rollValue = 0;
  let rollSuffix = "";
  let rollTimer: number | undefined;

  // ---------------------------------------------------------------------------
  // DOM — root and layers
  // ---------------------------------------------------------------------------

  const root = environment.createElement("div", "ag-layout");
  root.setAttribute("data-agentation-ui", "");

  // --- Palette anchor ---------------------------------------------------------
  // Mirrors the toolbar's own fixed box (337x44, constant in both states) so
  // the panel keeps the original `right: 5px; bottom: calc(100% + 0.5rem)`
  // relationship without either region measuring the other mid-morph.
  const anchor = environment.createElement("div", "ag-layout-anchor");
  const palette = environment.createElement("div", "ag-layout-palette");
  palette.setAttribute("role", "dialog");
  palette.setAttribute("aria-label", "Layout Mode");
  palette.hidden = true;
  anchor.appendChild(palette);

  const paletteHeader = environment.createElement("div", "ag-layout-palette-header");
  const paletteTitle = environment.createElement("div", "ag-layout-palette-title");
  paletteTitle.textContent = "Layout Mode";
  const paletteDesc = environment.createElement("div", "ag-layout-palette-desc");
  paletteDesc.append(environment.document.createTextNode(`${PALETTE_DESCRIPTION} `));
  const paletteLink = environment.createElement("a");
  paletteLink.href = PALETTE_DOC_URL;
  paletteLink.target = "_blank";
  paletteLink.rel = "noopener noreferrer";
  paletteLink.textContent = "Learn more.";
  paletteDesc.appendChild(paletteLink);
  paletteHeader.append(paletteTitle, paletteDesc);

  const wireframeToggle = button("ag-layout-canvas-toggle");
  const wireframeIcon = environment.createElement("span", "ag-layout-canvas-toggle-icon");
  wireframeIcon.appendChild(glyph(WIREFRAME_GLYPH, 14, 14));
  const wireframeLabel = environment.createElement("span", "ag-layout-canvas-toggle-label");
  wireframeLabel.textContent = "Wireframe New Page";
  wireframeToggle.append(wireframeIcon, wireframeLabel);

  const purposeWrap = environment.createElement("div", "ag-layout-purpose-wrap");
  const purposeInner = environment.createElement("div", "ag-layout-purpose-inner");
  const purposeLabel = environment.createElement("label", "ag-visually-hidden");
  purposeLabel.htmlFor = "ag-layout-purpose";
  purposeLabel.textContent = "Wireframe page description";
  const purposeInput = environment.createElement("textarea", "ag-layout-purpose-input");
  purposeInput.id = "ag-layout-purpose";
  purposeInput.rows = 2;
  purposeInput.placeholder = "Describe this page to provide additional context for your agent.";
  purposeInner.append(purposeLabel, purposeInput);
  purposeWrap.appendChild(purposeInner);

  const paletteScroll = environment.createElement("div", "ag-layout-scroll");
  const paletteItems = new Map<ComponentType, HTMLButtonElement>();
  for (const section of COMPONENT_REGISTRY) {
    const group = environment.createElement("div", "ag-layout-palette-section");
    const title = environment.createElement("div", "ag-layout-palette-section-title");
    title.textContent = section.section;
    group.appendChild(title);
    for (const item of section.items) {
      const node = button("ag-layout-item");
      node.setAttribute("aria-pressed", "false");
      const icon = environment.createElement("span", "ag-layout-item-icon");
      icon.appendChild(glyph(PALETTE_GLYPHS[item.type], 20, 16));
      const label = environment.createElement("span", "ag-layout-item-label");
      label.textContent = item.label;
      node.append(icon, label);
      node.dataset.component = item.type;
      group.appendChild(node);
      paletteItems.set(item.type, node);
    }
    paletteScroll.appendChild(group);
  }

  const footerWrap = environment.createElement("div", "ag-layout-footer-wrap");
  const footerInner = environment.createElement("div", "ag-layout-footer-inner");
  const footerContent = environment.createElement("div", "ag-layout-footer-content");
  const footer = environment.createElement("div", "ag-layout-footer");
  const footerCount = environment.createElement("span", "ag-layout-footer-count");
  const countStatic = environment.createElement("span", "ag-layout-count-static");
  const rollWrap = environment.createElement("span", "ag-layout-rolling-wrap");
  const rollGhost = environment.createElement("span", "ag-layout-rolling-ghost");
  const rollOld = environment.createElement("span", "ag-layout-rolling-num");
  const rollNew = environment.createElement("span", "ag-layout-rolling-num");
  rollWrap.append(rollGhost, rollOld, rollNew);
  rollWrap.hidden = true;
  const rollTail = environment.document.createTextNode("");
  footerCount.append(countStatic, rollWrap, rollTail);
  const footerClear = button("ag-layout-footer-clear");
  footerClear.textContent = "Clear";
  footer.append(footerCount, footerClear);
  footerContent.appendChild(footer);
  footerInner.appendChild(footerContent);
  footerWrap.appendChild(footerInner);
  footerWrap.hidden = true;

  palette.append(paletteHeader, wireframeToggle, purposeWrap, paletteScroll, footerWrap);

  // --- Placement layer --------------------------------------------------------
  const placementLayer = environment.createElement("div", "ag-layout-overlay");
  const placementNodes = new Map<string, PlacementNode>();

  // --- Rearrange layer --------------------------------------------------------
  const rearrangeLayer = environment.createElement("div", "ag-layout-rearrange");
  const hoverHighlight = environment.createElement("div", "ag-layout-hover-highlight");
  hoverHighlight.hidden = true;
  rearrangeLayer.appendChild(hoverHighlight);
  const sectionNodes = new Map<string, SectionNode>();

  // --- Connectors -------------------------------------------------------------
  const connectorSvg = environment.createSvg("svg", { "aria-hidden": "true" });
  connectorSvg.setAttribute("class", "ag-layout-connectors");
  const connectorDefs = environment.createSvg("defs");
  const dotShadow = environment.createSvg("filter", {
    id: "ag-layout-connector-dot-shadow",
    x: "-50%",
    y: "-50%",
    width: "200%",
    height: "200%",
  });
  dotShadow.appendChild(
    environment.createSvg("feDropShadow", { dx: "0", dy: "0.5", stdDeviation: "1", "flood-opacity": "0.15" }),
  );
  connectorDefs.appendChild(dotShadow);
  connectorSvg.appendChild(connectorDefs);
  const connectorNodes: ConnectorNode[] = [];
  connectorSvg.toggleAttribute("hidden", true);

  // --- Transient visuals ------------------------------------------------------
  const drawBoxNode = environment.createElement("div", "ag-layout-draw-box");
  drawBoxNode.hidden = true;
  const selectBoxNode = environment.createElement("div", "ag-layout-select-box");
  selectBoxNode.hidden = true;
  const sizeIndicatorNode = environment.createElement("div", "ag-layout-size-indicator");
  sizeIndicatorNode.hidden = true;
  const dragPreview = environment.createElement("div", "ag-layout-drag-preview");
  dragPreview.hidden = true;
  const guideNodes: HTMLDivElement[] = [];
  const guideLayer = environment.createElement("div", "ag-layout-guides");

  // --- Text / note editor -----------------------------------------------------
  const editorNode = environment.createElement("div", "ag-layout-editor");
  editorNode.setAttribute("role", "dialog");
  editorNode.hidden = true;
  const editorHeader = environment.createElement("div", "ag-layout-editor-header");
  const editorElement = environment.createElement("span", "ag-layout-editor-element");
  editorHeader.appendChild(editorElement);
  const editorLabel = environment.createElement("label", "ag-visually-hidden");
  editorLabel.htmlFor = "ag-layout-editor-input";
  editorLabel.textContent = "Text";
  const editorInput = environment.createElement("textarea", "ag-layout-editor-textarea");
  editorInput.id = "ag-layout-editor-input";
  editorInput.rows = 2;
  const editorActions = environment.createElement("div", "ag-layout-editor-actions");
  const editorDeleteWrap = environment.createElement("div", "ag-layout-editor-delete-wrapper");
  const editorDelete = button("ag-layout-editor-delete", "Delete text");
  editorDelete.appendChild(createIcon(environment, "trash", 22));
  editorDeleteWrap.appendChild(editorDelete);
  const editorCancel = button("ag-layout-editor-cancel");
  editorCancel.textContent = "Cancel";
  const editorSubmit = button("ag-layout-editor-submit");
  editorActions.append(editorDeleteWrap, editorCancel, editorSubmit);
  editorNode.append(editorHeader, editorLabel, editorInput, editorActions);

  root.append(
    anchor,
    placementLayer,
    rearrangeLayer,
    connectorSvg,
    drawBoxNode,
    selectBoxNode,
    guideLayer,
    sizeIndicatorNode,
    dragPreview,
    editorNode,
  );

  // ---------------------------------------------------------------------------
  // Intent plumbing
  // ---------------------------------------------------------------------------

  function reportPlacements(): void {
    dispatch({ type: "placements-change", placements: placements.map((placement) => ({ ...placement })) });
  }

  function reportRearrange(): void {
    if (!rearrange) return;
    dispatch({
      type: "rearrange-change",
      state: {
        ...rearrange,
        sections: rearrange.sections.map((section) => ({ ...section })),
        originalOrder: [...rearrange.originalOrder],
      },
    });
  }

  function syncPlacement(id: string): void {
    const placement = placements.find((candidate) => candidate.id === id);
    if (placement) dispatch({ type: "placement-sync", placement: { ...placement } });
  }

  function syncSection(id: string): void {
    const section = rearrange?.sections.find((candidate) => candidate.id === id);
    if (section) dispatch({ type: "rearrange-sync", section: { ...section } });
  }

  function setInteracting(interacting: boolean): void {
    dispatch({ type: "layout-interacting", interacting });
  }

  /** Trailing sync for keyboard nudges, so key-repeat is not one POST per frame. */
  function scheduleNudgeSync(): void {
    cancel(nudgeSyncTimer);
    nudgeSyncTimer = later(() => {
      nudgeSyncTimer = undefined;
      for (const id of selection.placements) syncPlacement(id);
      for (const id of selection.sections) syncSection(id);
    }, NUDGE_SYNC_MS);
  }

  // ---------------------------------------------------------------------------
  // Selection
  // ---------------------------------------------------------------------------

  /**
   * Apply a click to the shared selection. Returns the ids that end up selected
   * in the clicked overlay. Without shift the *other* overlay is cleared too —
   * the original achieved this with a deselect signal counter.
   */
  function selectOne(kind: "placements" | "sections", id: string, additive: boolean): void {
    const own = selection[kind];
    const other = kind === "placements" ? selection.sections : selection.placements;
    if (additive) {
      if (own.has(id)) own.delete(id);
      else own.add(id);
      return;
    }
    if (!own.has(id)) {
      own.clear();
      own.add(id);
      other.clear();
      return;
    }
    // Already selected without shift: keep the group so it can be dragged.
    if (other.size > 0) other.clear();
  }

  function clearSelection(): void {
    selection.placements.clear();
    selection.sections.clear();
  }

  function selectionSize(): number {
    return selection.placements.size + selection.sections.size;
  }

  // ---------------------------------------------------------------------------
  // Snapping targets
  // ---------------------------------------------------------------------------

  /**
   * Snap candidates for a gesture: every placement and captured section not
   * being dragged, then the page box. Order matters — `computeSnap` breaks ties
   * by "nearest wins" over the list as given.
   */
  function snapTargets(excludePlacements: ReadonlySet<string>, excludeSections: ReadonlySet<string>): Box[] {
    const targets: Box[] = [];
    for (const placement of placements) {
      if (!excludePlacements.has(placement.id)) targets.push({ x: placement.x, y: placement.y, width: placement.width, height: placement.height });
    }
    for (const section of rearrange?.sections ?? []) {
      if (!excludeSections.has(section.id)) targets.push(section.currentRect);
    }
    targets.push({
      x: 0,
      y: 0,
      width: environment.innerWidth,
      height: environment.document.documentElement.scrollHeight,
    });
    return targets;
  }

  // ---------------------------------------------------------------------------
  // Page targeting for rearrange capture
  // ---------------------------------------------------------------------------

  /** True when the event started inside any Agentation UI layer. */
  function fromOwnUi(event: Event): boolean {
    const owner = root.getRootNode();
    const host = owner instanceof environment.ShadowRoot ? owner.host : null;
    for (const entry of event.composedPath()) {
      if (entry === root || entry === host) return true;
      if (entry instanceof environment.Element && entry.hasAttribute("data-agentation-ui")) return true;
    }
    return false;
  }

  /**
   * Pick a capture target: walk up past tiny inline elements, exactly as the
   * original did, and refuse anything belonging to Agentation.
   */
  function pickTarget(from: Element | null): HTMLElement | null {
    const doc = environment.document;
    const owner = root.getRootNode();
    const host = owner instanceof environment.ShadowRoot ? owner.host : null;
    let current: Element | null = from;
    while (current && current !== doc.body && current !== doc.documentElement) {
      if (!(current instanceof environment.HTMLElement)) {
        current = current.parentElement;
        continue;
      }
      if (host && (current === host || host.contains(current))) return null;
      if (current.closest("[data-agentation-ui]")) return null;
      if (SKIP_TAGS[current.tagName.toLowerCase()]) {
        current = current.parentElement;
        continue;
      }
      const rect = current.getBoundingClientRect();
      if (rect.width >= MIN_CAPTURE_SIZE && rect.height >= MIN_CAPTURE_SIZE) return current;
      current = current.parentElement;
    }
    return null;
  }

  /** Resolve a captured section's live page element, tolerating stale selectors. */
  function elementForSection(section: DetectedSection): Element | null {
    try {
      return environment.document.querySelector(section.selector);
    } catch {
      return null;
    }
  }

  /**
   * Already represented by a capture? Exact match, an ancestor of a capture, or
   * a descendant of one — any of the three would duplicate geometry.
   */
  function capturedSectionFor(target: HTMLElement): DetectedSection | null {
    for (const section of rearrange?.sections ?? []) {
      const captured = elementForSection(section);
      if (!captured) continue;
      if (captured === target || target.contains(captured) || captured.contains(target)) return section;
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  function layoutActive(): boolean {
    return !!model && model.layout.active;
  }

  function activeComponent(): ComponentType | null {
    return model?.layout.exiting ? null : (model?.layout.activeComponent ?? null);
  }

  function renderPalette(): void {
    if (!model) return;
    const { layout } = model;

    root.classList.toggle("is-light", model.theme === "light");
    root.classList.toggle("is-wireframe", layout.wireframe);

    // --- anchor tracks the toolbar ---
    if (model.toolbarPosition) {
      anchor.style.left = `${model.toolbarPosition.x}px`;
      anchor.style.top = `${model.toolbarPosition.y}px`;
      anchor.style.right = "auto";
      anchor.style.bottom = "auto";
    } else {
      anchor.style.left = "";
      anchor.style.top = "";
      anchor.style.right = "";
      anchor.style.bottom = "";
    }

    // --- mount / enter / exit ---
    const visible = model.active && layout.active && !layout.exiting;
    if (visible && !paletteMounted) {
      paletteMounted = true;
      palette.hidden = false;
      cancel(paletteExitTimer);
      paletteExitTimer = undefined;
      environment.timers.cancelAnimationFrame(paletteEnterFrame);
      paletteEnterFrame = environment.timers.requestAnimationFrame(() => {
        paletteEnterFrame = environment.timers.requestAnimationFrame(() => {
          paletteEnterFrame = undefined;
          palette.classList.remove("is-exit");
          palette.classList.add("is-enter");
        });
      });
    } else if (!visible && paletteMounted && paletteExitTimer === undefined) {
      environment.timers.cancelAnimationFrame(paletteEnterFrame);
      paletteEnterFrame = undefined;
      palette.classList.remove("is-enter");
      palette.classList.add("is-exit");
      paletteExitTimer = later(() => {
        paletteExitTimer = undefined;
        paletteMounted = false;
        palette.hidden = true;
      }, PALETTE_EXIT_MS);
    }

    // --- wireframe toggle + purpose ---
    wireframeToggle.classList.toggle("is-active", layout.wireframe);
    wireframeToggle.setAttribute("aria-pressed", layout.wireframe ? "true" : "false");
    purposeWrap.classList.toggle("is-collapsed", !layout.wireframe);
    purposeInput.disabled = !layout.wireframe;
    if (environment.document.activeElement !== purposeInput && purposeInput.value !== layout.wireframePurpose) {
      purposeInput.value = layout.wireframePurpose;
    }

    // --- armed component ---
    const armed = layout.activeComponent;
    for (const [type, node] of paletteItems) {
      const on = armed === type;
      node.classList.toggle("is-active", on);
      node.setAttribute("aria-pressed", on ? "true" : "false");
    }

    // --- footer ---
    const total = placements.length + (rearrange?.sections.length ?? 0);
    if (total > 0) {
      lastFooterCount = total;
      lastFooterSuffix = layout.wireframe
        ? total === 1
          ? "Component"
          : "Components"
        : total === 1
          ? "Change"
          : "Changes";
    }
    const hasContent = total > 0;
    if (hasContent) {
      cancel(footerHideTimer);
      footerHideTimer = undefined;
      if (!footerVisible) {
        footerVisible = true;
        footerCollapsed = true;
        footerWrap.hidden = false;
        footerWrap.classList.add("is-collapsed");
        environment.timers.requestAnimationFrame(() => {
          environment.timers.requestAnimationFrame(() => {
            footerCollapsed = false;
            footerWrap.classList.remove("is-collapsed");
          });
        });
      } else if (footerCollapsed) {
        footerCollapsed = false;
        footerWrap.classList.remove("is-collapsed");
      }
    } else if (footerVisible && footerHideTimer === undefined) {
      footerCollapsed = true;
      footerWrap.classList.add("is-collapsed");
      footerHideTimer = later(() => {
        footerHideTimer = undefined;
        footerVisible = false;
        footerWrap.hidden = true;
      }, FOOTER_COLLAPSE_MS);
    }
    renderCount(lastFooterCount, lastFooterSuffix);
  }

  /**
   * Rolling count. The number rolls on its own; when the suffix changes too
   * ("Change" -> "Changes") the whole label rolls, as in the original.
   */
  function renderCount(value: number, suffix: string): void {
    const label = suffix ? `${value} ${suffix}` : `${value}`;
    if (value === rollValue && suffix === rollSuffix) {
      if (rollWrap.hidden) setText(countStatic, label);
      return;
    }

    // Hitting zero skips the animation: the footer is collapsing anyway.
    if (value === 0) {
      rollValue = value;
      rollSuffix = suffix;
      cancel(rollTimer);
      rollTimer = undefined;
      rollWrap.hidden = true;
      countStatic.hidden = false;
      setText(rollTail, "");
      setText(countStatic, label);
      return;
    }

    const direction = value > rollValue ? "up" : "down";
    const suffixChanged = suffix !== rollSuffix;
    const previousLabel = suffixChanged ? `${rollValue} ${rollSuffix}` : `${rollValue}`;
    const nextLabel = suffixChanged ? label : `${value}`;

    rollValue = value;
    rollSuffix = suffix;

    setText(rollGhost, nextLabel);
    setText(rollOld, previousLabel);
    setText(rollNew, nextLabel);
    setText(rollTail, suffixChanged || !suffix ? "" : ` ${suffix}`);

    rollOld.className = `ag-layout-rolling-num ag-layout-${direction === "up" ? "exit-up" : "exit-down"}`;
    rollNew.className = `ag-layout-rolling-num ag-layout-${direction === "up" ? "enter-up" : "enter-down"}`;
    countStatic.hidden = true;
    rollWrap.hidden = false;
    restartAnimation(rollOld);
    restartAnimation(rollNew);

    cancel(rollTimer);
    rollTimer = later(() => {
      rollTimer = undefined;
      rollWrap.hidden = true;
      countStatic.hidden = false;
      setText(countStatic, rollSuffix ? `${rollValue} ${rollSuffix}` : `${rollValue}`);
    }, ROLL_MS);
  }

  function placementNode(placement: DesignPlacement): PlacementNode {
    const existing = placementNodes.get(placement.id);
    if (existing) return existing;

    const node = environment.createElement("div", "ag-layout-placement");
    node.dataset.designPlacement = placement.id;
    const label = environment.createElement("span", "ag-layout-placement-label");
    const note = environment.createElement("span", "ag-layout-placement-note");
    const content = environment.createElement("div", "ag-layout-placement-content");
    const skeleton = createSkeleton(environment, placement.type, placement.width, placement.height, placement.text);
    content.appendChild(skeleton);
    const remove = button("ag-layout-delete", "Delete component");
    remove.textContent = "\u2715";
    remove.dataset.deletePlacement = placement.id;
    node.append(label, note, content, remove);

    for (const direction of ["nw", "ne", "se", "sw"] as const) {
      const handle = button(`ag-layout-handle ag-layout-handle-${direction}`, `Resize ${direction}`);
      handle.dataset.resizePlacement = placement.id;
      handle.dataset.direction = direction;
      node.appendChild(handle);
    }
    for (const direction of ["n", "e", "s", "w"] as const) {
      const bar = button(`ag-layout-edge ag-layout-edge-${direction}`, `Resize ${direction}`);
      bar.dataset.resizePlacement = placement.id;
      bar.dataset.direction = direction;
      bar.appendChild(glyph(EDGE_ARROWS[direction], ...EDGE_ARROW_SIZE[direction]));
      node.appendChild(bar);
    }

    placementLayer.appendChild(node);
    const record: PlacementNode = {
      root: node,
      label,
      note,
      content,
      skeleton,
      skeletonType: placement.type,
      skeletonText: placement.text,
      skeletonWidth: placement.width,
      skeletonHeight: placement.height,
      lastNote: placement.text ?? "",
    };
    placementNodes.set(placement.id, record);
    return record;
  }

  function renderPlacements(scrollY: number): void {
    const armed = activeComponent();
    const exiting = !!model?.layout.exiting;
    placementLayer.classList.toggle("is-placing", armed !== null);
    placementLayer.classList.toggle("is-passthrough", armed === null);
    placementLayer.classList.toggle("is-exiting", exiting);
    placementLayer.hidden = !model?.layout.active;

    const live = new Set<string>();
    for (const placement of placements) {
      live.add(placement.id);
      const node = placementNode(placement);
      const selected = selection.placements.has(placement.id);

      node.root.style.left = `${placement.x}px`;
      node.root.style.top = `${placement.y - scrollY}px`;
      node.root.style.width = `${placement.width}px`;
      node.root.style.height = `${placement.height}px`;
      node.root.classList.toggle("is-selected", selected);
      node.root.classList.toggle("is-exiting", exitingPlacements.has(placement.id));

      setText(node.label, COMPONENT_MAP[placement.type]?.label ?? placement.type);
      if (placement.text) node.lastNote = placement.text;
      setText(node.note, placement.text || node.lastNote);
      node.note.classList.toggle("is-visible", !!placement.text);

      // The skeleton derives its whole subtree from type/size/caption, so a
      // caption or type change rebuilds; a size change only repaints.
      if (node.skeletonType !== placement.type || node.skeletonText !== placement.text) {
        const replacement = createSkeleton(
          environment,
          placement.type,
          placement.width,
          placement.height,
          placement.text,
        );
        node.content.replaceChild(replacement, node.skeleton);
        node.skeleton = replacement;
        node.skeletonType = placement.type;
        node.skeletonText = placement.text;
        node.skeletonWidth = placement.width;
        node.skeletonHeight = placement.height;
      } else if (node.skeletonWidth !== placement.width || node.skeletonHeight !== placement.height) {
        updateSkeleton(node.skeleton, placement.width, placement.height);
        node.skeletonWidth = placement.width;
        node.skeletonHeight = placement.height;
      }
    }

    for (const [id, node] of placementNodes) {
      if (live.has(id)) continue;
      node.root.remove();
      placementNodes.delete(id);
    }
  }

  function sectionNode(section: DetectedSection): SectionNode {
    const existing = sectionNodes.get(section.id);
    if (existing) return existing;

    const node = environment.createElement("div", "ag-layout-section-outline");
    node.dataset.rearrangeSection = section.id;
    const label = environment.createElement("span", "ag-layout-section-label");
    const note = environment.createElement("span", "ag-layout-section-note");
    const dimensions = environment.createElement("span", "ag-layout-section-dimensions");
    const remove = button("ag-layout-delete", "Remove capture");
    remove.textContent = "\u2715";
    remove.dataset.deleteSection = section.id;
    node.append(label, note, dimensions, remove);

    for (const direction of HANDLE_DIRECTIONS) {
      const handle = button(`ag-layout-handle ag-layout-handle-${direction}`, `Resize ${direction}`);
      handle.dataset.resizeSection = section.id;
      handle.dataset.direction = direction;
      node.appendChild(handle);
    }

    const badge = environment.createElement("span", "ag-layout-ghost-badge");
    const badgeText = environment.document.createTextNode("");
    const badgeExtra = environment.createElement("span", "ag-layout-ghost-badge-extra");
    badge.append(badgeText, badgeExtra);
    node.appendChild(badge);

    rearrangeLayer.appendChild(node);
    const record: SectionNode = {
      root: node,
      label,
      note,
      dimensions,
      badge,
      badgeText,
      badgeExtra,
      lastNote: section.note ?? "",
      seenGhost: false,
    };
    sectionNodes.set(section.id, record);
    return record;
  }

  function renderSections(scrollY: number): void {
    const exiting = !!model?.layout.exiting;
    const wireframe = !!model?.layout.wireframe;
    rearrangeLayer.classList.toggle("is-exiting", exiting);
    rearrangeLayer.hidden = !model?.layout.active;

    const sections = rearrange?.sections ?? [];
    const live = new Set<string>();

    // Track which action came first, for badge ordering.
    for (const section of sections) {
      if (firstAction.has(section.id)) continue;
      if (rectMoved(section)) firstAction.set(section.id, "move");
      else if (rectResized(section)) firstAction.set(section.id, "resize");
    }
    for (const id of [...firstAction.keys()]) {
      if (!sections.some((section) => section.id === id)) firstAction.delete(id);
    }

    for (const section of sections) {
      const selected = selection.sections.has(section.id);
      const isExiting = exitingSections.has(section.id);

      // Hide sections whose page element vanished (or changed size wildly),
      // unless they are selected or animating out.
      let present = true;
      if (!isExiting && !selected) {
        const element = elementForSection(section);
        if (!element) present = false;
        else {
          const rect = element.getBoundingClientRect();
          const expected = section.originalRect;
          const drift = Math.abs(rect.width - expected.width) + Math.abs(rect.height - expected.height);
          present = drift < 200;
        }
      }

      const changed = rectChanged(section);
      // In wireframe mode a settled ghost is hidden: the page is not shown.
      if (!present || (wireframe && changed && !selected)) {
        const node = sectionNodes.get(section.id);
        if (node) node.root.hidden = true;
        if (present) live.add(section.id);
        continue;
      }

      live.add(section.id);
      const node = sectionNode(section);
      node.root.hidden = false;

      const rect = section.currentRect;
      const screenY = section.isFixed ? rect.y : rect.y - scrollY;
      node.root.style.left = `${rect.x}px`;
      node.root.style.top = `${screenY}px`;
      node.root.style.width = `${rect.width}px`;
      node.root.style.height = `${rect.height}px`;

      const delta = selection.sections.has(section.id) ? sectionDragDelta : null;
      node.root.style.transform = delta ? `translate(${delta.x}px, ${delta.y}px)` : "";

      node.root.classList.toggle("is-selected", selected);
      node.root.classList.toggle("is-exiting", isExiting || exiting);
      node.root.classList.toggle("is-ghost", changed);
      // Outlines wait for already-moved page elements to settle on entry.
      node.root.classList.toggle("is-pending", !outlinesReady);

      if (changed) {
        if (!node.seenGhost) {
          node.seenGhost = true;
          restartAnimation(node.root);
        }
      } else {
        node.seenGhost = false;
      }

      setText(node.label, section.label);
      if (section.note) node.lastNote = section.note;
      setText(node.note, section.note || node.lastNote);
      node.note.classList.toggle("is-visible", !!section.note);
      setText(node.dimensions, `${Math.round(rect.width)} \u00D7 ${Math.round(rect.height)}`);

      node.badge.hidden = !changed;
      if (changed) {
        const moved = rectMoved(section);
        const resized = rectResized(section);
        if (moved && resized) {
          const first = firstAction.get(section.id);
          const [a, b] = first === "resize" ? ["Resize", "Move"] : ["Move", "Resize"];
          setText(node.badgeText, `Suggested ${a} `);
          setText(node.badgeExtra, `& ${b}`);
          node.badgeExtra.hidden = false;
        } else {
          setText(node.badgeText, `Suggested ${resized ? "Resize" : "Move"}`);
          setText(node.badgeExtra, "");
          node.badgeExtra.hidden = true;
        }
      }
    }

    for (const [id, node] of sectionNodes) {
      if (live.has(id)) continue;
      node.root.remove();
      sectionNodes.delete(id);
    }

    // Hover highlight
    if (hoverBox) {
      hoverHighlight.hidden = false;
      hoverHighlight.style.left = `${hoverBox.x}px`;
      hoverHighlight.style.top = `${hoverBox.y}px`;
      hoverHighlight.style.width = `${hoverBox.width}px`;
      hoverHighlight.style.height = `${hoverBox.height}px`;
    } else {
      hoverHighlight.hidden = true;
    }
  }

  function connectorNode(index: number): ConnectorNode {
    const existing = connectorNodes[index];
    if (existing) return existing;
    const group = environment.createSvg("g");
    const line = environment.createSvg("path", {
      class: "ag-layout-connector-line",
      fill: "none",
      stroke: "rgba(59, 130, 246, 0.45)",
      "stroke-width": "1.5",
    });
    const dot = (): SVGCircleElement =>
      environment.createSvg("circle", {
        class: "ag-layout-connector-dot",
        fill: "rgba(59, 130, 246, 0.8)",
        stroke: "#fff",
        "stroke-width": "1.5",
        filter: "url(#ag-layout-connector-dot-shadow)",
      });
    const from = dot();
    const to = dot();
    group.append(line, from, to);
    connectorSvg.appendChild(group);
    const record: ConnectorNode = { group, line, from, to };
    connectorNodes[index] = record;
    return record;
  }

  function renderConnectors(scrollY: number): void {
    const wireframe = !!model?.layout.wireframe;
    const exiting = !!model?.layout.exiting;
    if (!model?.layout.active || wireframe) {
      connectorSvg.toggleAttribute("hidden", true);
      return;
    }

    type Entry = { id: string; from: Box; to: Box; isFixed: boolean; selected: boolean; exiting: boolean };
    const entries: Entry[] = [];
    for (const section of rearrange?.sections ?? []) {
      const delta = selection.sections.has(section.id) ? sectionDragDelta : null;
      if (!rectChanged(section) && !delta) continue;
      const target = delta
        ? {
            x: Math.max(0, section.currentRect.x + delta.x),
            y: Math.max(0, section.currentRect.y + delta.y),
            width: section.currentRect.width,
            height: section.currentRect.height,
          }
        : section.currentRect;
      entries.push({
        id: section.id,
        from: section.originalRect,
        to: target,
        isFixed: !!section.isFixed,
        selected: selection.sections.has(section.id),
        exiting: exitingSections.has(section.id),
      });
    }
    for (const [id, data] of exitingConnectors) {
      if (entries.some((entry) => entry.id === id)) continue;
      entries.push({ id, from: data.from, to: data.to, isFixed: data.isFixed, selected: false, exiting: true });
    }

    connectorSvg.classList.toggle("is-exiting", exiting);

    let used = 0;
    for (const entry of entries) {
      const ox = entry.from.x + entry.from.width / 2;
      const oy = (entry.isFixed ? entry.from.y : entry.from.y - scrollY) + entry.from.height / 2;
      const cx = entry.to.x + entry.to.width / 2;
      const cy = (entry.isFixed ? entry.to.y : entry.to.y - scrollY) + entry.to.height / 2;
      const dx = cx - ox;
      const dy = cy - oy;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < 2) continue;

      const proximity = Math.min(1, distance / 40);
      const perpendicular = Math.min(distance * 0.3, 60);
      const nx = -dy / distance;
      const ny = dx / distance;
      const px = (ox + cx) / 2 + nx * perpendicular;
      const py = (oy + cy) / 2 + ny * perpendicular;
      const dragging = !!sectionDragDelta && selection.sections.has(entry.id);
      const lineOpacity = (dragging || entry.selected ? 1 : 0.4) * proximity;
      const dotOpacity = (dragging || entry.selected ? 1 : 0.5) * proximity;

      const node = connectorNode(used);
      used += 1;
      node.group.removeAttribute("hidden");
      node.group.setAttribute("class", entry.exiting ? "ag-layout-connector-exiting" : "");
      node.line.setAttribute("d", `M ${ox} ${oy} Q ${px} ${py} ${cx} ${cy}`);
      node.line.setAttribute("opacity", `${lineOpacity}`);
      node.from.setAttribute("cx", `${ox}`);
      node.from.setAttribute("cy", `${oy}`);
      node.from.setAttribute("r", `${4 * proximity}`);
      node.from.setAttribute("opacity", `${dotOpacity}`);
      node.to.setAttribute("cx", `${cx}`);
      node.to.setAttribute("cy", `${cy}`);
      node.to.setAttribute("r", `${4 * proximity}`);
      node.to.setAttribute("opacity", `${dotOpacity}`);
    }

    for (let index = used; index < connectorNodes.length; index += 1) {
      connectorNodes[index].group.setAttribute("hidden", "");
    }
    connectorSvg.toggleAttribute("hidden", used === 0);
  }

  function renderTransients(scrollY: number): void {
    if (drawBox) {
      drawBoxNode.hidden = false;
      drawBoxNode.style.left = `${drawBox.x}px`;
      drawBoxNode.style.top = `${drawBox.y}px`;
      drawBoxNode.style.width = `${drawBox.width}px`;
      drawBoxNode.style.height = `${drawBox.height}px`;
    } else {
      drawBoxNode.hidden = true;
    }

    if (selectBox) {
      selectBoxNode.hidden = false;
      selectBoxNode.style.left = `${selectBox.x}px`;
      selectBoxNode.style.top = `${selectBox.y}px`;
      selectBoxNode.style.width = `${selectBox.width}px`;
      selectBoxNode.style.height = `${selectBox.height}px`;
    } else {
      selectBoxNode.hidden = true;
    }

    if (sizeIndicator) {
      sizeIndicatorNode.hidden = false;
      sizeIndicatorNode.style.left = `${sizeIndicator.x}px`;
      sizeIndicatorNode.style.top = `${sizeIndicator.y}px`;
      setText(sizeIndicatorNode, sizeIndicator.text);
    } else {
      sizeIndicatorNode.hidden = true;
    }

    while (guideNodes.length < guides.length) {
      const node = environment.createElement("div", "ag-layout-guide");
      guideNodes.push(node);
      guideLayer.appendChild(node);
    }
    for (let index = 0; index < guideNodes.length; index += 1) {
      const node = guideNodes[index];
      const guide = guides[index];
      if (!guide) {
        node.hidden = true;
        continue;
      }
      node.hidden = false;
      node.classList.toggle("is-x", guide.axis === "x");
      node.classList.toggle("is-y", guide.axis === "y");
      if (guide.axis === "x") {
        node.style.left = `${guide.pos}px`;
        node.style.top = "0px";
      } else {
        node.style.left = "0px";
        node.style.top = `${guide.pos - scrollY}px`;
      }
    }
  }

  function renderEditor(scrollY: number): void {
    if (!editor) {
      editorNode.hidden = true;
      return;
    }

    let rect: Box | undefined;
    let element = "";
    let placeholder = "Label or content text";
    if (editor.target === "placement") {
      const placement = placements.find((candidate) => candidate.id === editor?.id);
      if (!placement) {
        closeEditor(true);
        return;
      }
      rect = { x: placement.x, y: placement.y - scrollY, width: placement.width, height: placement.height };
      element = COMPONENT_MAP[placement.type]?.label ?? placement.type;
      placeholder = TEXT_PLACEHOLDERS[placement.type] ?? placeholder;
    } else {
      const section = rearrange?.sections.find((candidate) => candidate.id === editor?.id);
      if (!section) {
        closeEditor(true);
        return;
      }
      const current = section.currentRect;
      rect = {
        x: current.x,
        y: section.isFixed ? current.y : current.y - scrollY,
        width: current.width,
        height: current.height,
      };
      element = section.label;
      placeholder = "Add a note about this section";
    }

    editorNode.hidden = false;
    setText(editorElement, element);
    editorNode.setAttribute("aria-label", element);
    if (editorInput.placeholder !== placeholder) editorInput.placeholder = placeholder;
    setText(editorSubmit, editor.hadText ? "Save" : "Set");
    editorDeleteWrap.hidden = !editor.hadText;
    editorNode.classList.toggle("is-exit", editor.exiting);
    editorNode.classList.toggle("is-enter", !editor.exiting);

    const centerX = rect.x + rect.width / 2;
    const aboveY = rect.y - 8;
    const belowY = rect.y + rect.height + 8;
    const left = Math.max(160, Math.min(environment.innerWidth - 160, centerX));
    editorNode.style.left = `${left}px`;
    if (aboveY > 200) {
      editorNode.style.top = "auto";
      editorNode.style.bottom = `${environment.innerHeight - aboveY}px`;
    } else if (belowY < environment.innerHeight - 100) {
      editorNode.style.bottom = "auto";
      editorNode.style.top = `${belowY}px`;
    } else {
      // Tall target: park the editor at the vertical centre of the viewport.
      editorNode.style.bottom = "auto";
      editorNode.style.top = `${Math.max(80, environment.innerHeight / 2 - 80)}px`;
    }
  }

  function render(): void {
    if (!model) return;
    const scrollY = environment.scrollY;
    renderPalette();
    renderPlacements(scrollY);
    renderSections(scrollY);
    renderConnectors(scrollY);
    renderTransients(scrollY);
    renderEditor(scrollY);
    dragPreview.hidden = !(gesture?.kind === "palette" && gesture.dragged);
  }

  // ---------------------------------------------------------------------------
  // Editor
  // ---------------------------------------------------------------------------

  function openEditor(target: "placement" | "section", id: string): void {
    let value = "";
    if (target === "placement") {
      const placement = placements.find((candidate) => candidate.id === id);
      if (!placement) return;
      value = placement.text ?? "";
    } else {
      const section = rearrange?.sections.find((candidate) => candidate.id === id);
      if (!section) return;
      value = section.note ?? "";
    }
    cancel(editorExitTimer);
    editorExitTimer = undefined;
    editor = { target, id, hadText: value.length > 0, exiting: false };
    editorInput.value = value;
    render();
    restartAnimation(editorNode);
    environment.timers.requestAnimationFrame(() => {
      editorInput.focus();
      const end = editorInput.value.length;
      editorInput.setSelectionRange(end, end);
    });
  }

  function closeEditor(immediate = false): void {
    if (!editor) return;
    if (immediate) {
      cancel(editorExitTimer);
      editorExitTimer = undefined;
      editor = null;
      editorNode.hidden = true;
      return;
    }
    editor = { ...editor, exiting: true };
    render();
    cancel(editorExitTimer);
    editorExitTimer = later(() => {
      editorExitTimer = undefined;
      editor = null;
      render();
    }, EDITOR_EXIT_MS);
  }

  function submitEditor(text: string): void {
    if (!editor) return;
    const trimmed = text.trim();
    const value = trimmed.length > 0 ? trimmed : undefined;
    if (editor.target === "placement") {
      const id = editor.id;
      placements = placements.map((placement) =>
        placement.id === id ? { ...placement, text: value } : placement,
      );
      reportPlacements();
      syncPlacement(id);
    } else if (rearrange) {
      const id = editor.id;
      rearrange = {
        ...rearrange,
        sections: rearrange.sections.map((section) =>
          section.id === id ? { ...section, note: value } : section,
        ),
      };
      reportRearrange();
      syncSection(id);
    }
    closeEditor();
  }

  // ---------------------------------------------------------------------------
  // Deletion
  // ---------------------------------------------------------------------------

  function deletePlacements(ids: readonly string[]): void {
    if (ids.length === 0) return;
    for (const id of ids) {
      exitingPlacements.add(id);
      selection.placements.delete(id);
    }
    render();
    later(() => {
      for (const id of ids) {
        exitingPlacements.delete(id);
        dispatch({ type: "placement-delete", id });
      }
    }, EXIT_MS);
  }

  function deleteSections(ids: readonly string[]): void {
    if (ids.length === 0) return;
    for (const id of ids) {
      exitingSections.add(id);
      selection.sections.delete(id);
    }
    render();
    later(() => {
      for (const id of ids) {
        exitingSections.delete(id);
        dispatch({ type: "rearrange-delete", id });
      }
    }, EXIT_MS);
  }

  // ---------------------------------------------------------------------------
  // Gestures
  // ---------------------------------------------------------------------------

  function endGesture(): void {
    if (!gesture) return;
    gesture.controller.abort();
    gesture = null;
  }

  /** Bind pointermove/pointerup for the life of one gesture. */
  function trackGesture(
    onMove: (event: PointerEvent) => void,
    onUp: (event: PointerEvent) => void,
  ): AbortController {
    const gestureController = new environment.AbortController();
    const options = { signal: gestureController.signal };
    const doc = environment.document;
    doc.addEventListener("pointermove", (event) => onMove(event as PointerEvent), options);
    doc.addEventListener(
      "pointerup",
      (event) => {
        const pointerEvent = event as PointerEvent;
        gestureController.abort();
        onUp(pointerEvent);
      },
      options,
    );
    doc.addEventListener(
      "pointercancel",
      (event) => {
        const pointerEvent = event as PointerEvent;
        gestureController.abort();
        onUp(pointerEvent);
      },
      options,
    );
    signal.addEventListener("abort", () => gestureController.abort(), { once: true });
    return gestureController;
  }

  // --- Palette drag -----------------------------------------------------------

  function startPaletteDrag(component: ComponentType, event: PointerEvent): void {
    const definition = DEFAULT_SIZES[component];
    const start: Point = { x: event.clientX, y: event.clientY };
    // The anchor box is the toolbar box, so its top is the original's
    // `toolbar.getBoundingClientRect().top` without measuring another region.
    const toolbarTop = anchor.getBoundingClientRect().top || environment.innerHeight;
    dragPreview.classList.toggle("is-wireframe", !!model?.layout.wireframe);

    const gestureController = trackGesture(
      (move) => {
        if (!gesture || gesture.kind !== "palette") return;
        const dx = move.clientX - start.x;
        const dy = move.clientY - start.y;
        if (
          !gesture.dragged &&
          (Math.abs(dx) > PALETTE_DRAG_THRESHOLD || Math.abs(dy) > PALETTE_DRAG_THRESHOLD)
        ) {
          gesture.dragged = true;
          dragPreview.hidden = false;
        }
        if (!gesture.dragged) return;

        const distance = Math.max(0, toolbarTop - move.clientY);
        const progress = Math.min(1, distance / PREVIEW_RAMP);
        const eased = 1 - (1 - progress) ** 2;
        const minWidth = 28;
        const minHeight = 20;
        const maxWidth = Math.min(140, definition.width * 0.18);
        const maxHeight = Math.min(90, definition.height * 0.18);
        const width = minWidth + (maxWidth - minWidth) * eased;
        const height = minHeight + (maxHeight - minHeight) * eased;
        dragPreview.style.width = `${width}px`;
        dragPreview.style.height = `${height}px`;
        dragPreview.style.left = `${move.clientX - width / 2}px`;
        dragPreview.style.top = `${move.clientY - height / 2}px`;
        dragPreview.style.opacity = `${0.5 + 0.5 * eased}`;
        setText(dragPreview, eased > 0.25 ? component : "");
      },
      (up) => {
        const dragged = gesture?.kind === "palette" && gesture.dragged;
        dragPreview.hidden = true;
        setText(dragPreview, "");
        endGesture();
        if (!dragged) return;
        clearSelection();
        dispatch({ type: "layout-drop-component", component, clientX: up.clientX, clientY: up.clientY });
      },
    );

    gesture = { kind: "palette", component, start, dragged: false, controller: gestureController };
  }

  // --- Place / marquee on empty overlay space ---------------------------------

  function startPlace(component: ComponentType, event: PointerEvent): void {
    const start: Point = { x: event.clientX, y: event.clientY };
    const scrollY = environment.scrollY;
    dispatch({ type: "layout-interacting", interacting: true });

    const gestureController = trackGesture(
      (move) => {
        if (!gesture || gesture.kind !== "place") return;
        gesture.end = { x: move.clientX, y: move.clientY };
        if (
          Math.abs(move.clientX - start.x) > PLACE_DRAG_THRESHOLD ||
          Math.abs(move.clientY - start.y) > PLACE_DRAG_THRESHOLD
        ) {
          gesture.dragged = true;
        }
        if (!gesture.dragged) return;
        drawBox = {
          x: Math.min(start.x, move.clientX),
          y: Math.min(start.y, move.clientY),
          width: Math.abs(move.clientX - start.x),
          height: Math.abs(move.clientY - start.y),
        };
        sizeIndicator = {
          x: move.clientX + 12,
          y: move.clientY + 12,
          text: `${Math.round(drawBox.width)} \u00D7 ${Math.round(drawBox.height)}`,
        };
        render();
      },
      () => {
        const current = gesture?.kind === "place" ? gesture : null;
        drawBox = null;
        sizeIndicator = null;
        endGesture();
        dispatch({ type: "layout-interacting", interacting: false });
        if (!current) {
          render();
          return;
        }

        const definition = DEFAULT_SIZES[component];
        let box: Box;
        if (current.dragged) {
          box = {
            x: Math.min(start.x, current.end.x),
            y: Math.min(start.y, current.end.y) + scrollY,
            width: Math.max(MIN_SIZE, Math.abs(current.end.x - start.x)),
            height: Math.max(MIN_SIZE, Math.abs(current.end.y - start.y)),
          };
        } else {
          box = {
            x: start.x - definition.width / 2,
            y: start.y + scrollY - definition.height / 2,
            width: definition.width,
            height: definition.height,
          };
        }
        box = clampToOrigin(box);

        const placement: DesignPlacement = {
          id: environment.randomId("dp"),
          type: component,
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          scrollY,
          timestamp: environment.now(),
        };
        placements = [...placements, placement];
        clearSelection();
        selection.placements.add(placement.id);
        reportPlacements();
        dispatch({ type: "placement-sync", placement: { ...placement } });
        // Disarm so the overlay goes passthrough and page capture works again.
        dispatch({ type: "layout-select-component", component: null });
        render();
      },
    );

    gesture = {
      kind: "place",
      component,
      start,
      scrollY,
      dragged: false,
      end: start,
      controller: gestureController,
    };
  }

  function startMarquee(event: PointerEvent): void {
    const start: Point = { x: event.clientX, y: event.clientY };
    const scrollY = environment.scrollY;
    const additive = event.shiftKey;
    if (!additive) clearSelection();
    render();

    const gestureController = trackGesture(
      (move) => {
        if (!gesture || gesture.kind !== "select") return;
        if (
          Math.abs(move.clientX - start.x) > SELECT_DRAG_THRESHOLD ||
          Math.abs(move.clientY - start.y) > SELECT_DRAG_THRESHOLD
        ) {
          gesture.dragged = true;
        }
        if (!gesture.dragged) return;
        selectBox = {
          x: Math.min(start.x, move.clientX),
          y: Math.min(start.y, move.clientY),
          width: Math.abs(move.clientX - start.x),
          height: Math.abs(move.clientY - start.y),
        };
        render();
      },
      (up) => {
        const dragged = gesture?.kind === "select" && gesture.dragged;
        selectBox = null;
        endGesture();
        if (dragged) {
          const box: Box = {
            x: Math.min(start.x, up.clientX),
            y: Math.min(start.y, up.clientY) + scrollY,
            width: Math.abs(up.clientX - start.x),
            height: Math.abs(up.clientY - start.y),
          };
          if (!additive) clearSelection();
          for (const placement of placements) {
            if (
              placement.x + placement.width > box.x &&
              placement.x < box.x + box.width &&
              placement.y + placement.height > box.y &&
              placement.y < box.y + box.height
            ) {
              selection.placements.add(placement.id);
            }
          }
        }
        render();
      },
    );

    gesture = { kind: "select", start, scrollY, additive, dragged: false, controller: gestureController };
  }

  // --- Move the shared selection ---------------------------------------------

  function startMove(event: PointerEvent): void {
    const start: Point = { x: event.clientX, y: event.clientY };
    const placementOrigins = new Map<string, Point>();
    const sizes = new Map<string, Box>();
    for (const placement of placements) {
      if (!selection.placements.has(placement.id)) continue;
      placementOrigins.set(placement.id, { x: placement.x, y: placement.y });
      sizes.set(placement.id, { x: placement.x, y: placement.y, width: placement.width, height: placement.height });
    }
    const sectionOrigins = new Map<string, Point>();
    for (const section of rearrange?.sections ?? []) {
      if (!selection.sections.has(section.id)) continue;
      sectionOrigins.set(section.id, { x: section.currentRect.x, y: section.currentRect.y });
      sizes.set(section.id, section.currentRect);
    }
    if (placementOrigins.size === 0 && sectionOrigins.size === 0) return;

    dispatch({ type: "layout-interacting", interacting: true });
    /** Placements duplicated by an Alt drag get their own base list. */
    let basePlacements = placements;

    const gestureController = trackGesture(
      (move) => {
        if (!gesture || gesture.kind !== "move") return;
        const rawDx = move.clientX - start.x;
        const rawDy = move.clientY - start.y;
        if (Math.abs(rawDx) > MOVE_DRAG_THRESHOLD || Math.abs(rawDy) > MOVE_DRAG_THRESHOLD) {
          gesture.moved = true;
        }
        if (!gesture.moved) return;

        // Alt/Option duplicates the dragged placements exactly once per gesture.
        if (move.altKey && !gesture.duplicated) {
          gesture.duplicated = true;
          const clones: DesignPlacement[] = [];
          for (const placement of placements) {
            if (!placementOrigins.has(placement.id)) continue;
            clones.push({ ...placement, id: environment.randomId("dp"), timestamp: environment.now() });
          }
          basePlacements = [...placements, ...clones];
          placements = basePlacements;
        }

        // One snapped delta for the whole selection, whichever overlay it spans.
        const boxes: Box[] = [];
        for (const [id, origin] of placementOrigins) {
          const size = sizes.get(id);
          if (size) boxes.push({ x: origin.x + rawDx, y: origin.y + rawDy, width: size.width, height: size.height });
        }
        for (const [id, origin] of sectionOrigins) {
          const size = sizes.get(id);
          if (size) boxes.push({ x: origin.x + rawDx, y: origin.y + rawDy, width: size.width, height: size.height });
        }
        const snap = computeSnap(
          unionBox(boxes),
          snapTargets(new Set(placementOrigins.keys()), new Set(sectionOrigins.keys())),
        );
        guides = snap.guides;
        const dx = rawDx + snap.dx;
        const dy = rawDy + snap.dy;
        gesture.lastDx = dx;
        gesture.lastDy = dy;

        // Placements commit live (the original re-rendered on every move);
        // sections only translate, so they stay "unchanged" until release.
        if (placementOrigins.size > 0) {
          placements = basePlacements.map((placement) => {
            const origin = placementOrigins.get(placement.id);
            if (!origin) return placement;
            return { ...placement, x: Math.max(0, origin.x + dx), y: Math.max(0, origin.y + dy) };
          });
          reportPlacements();
        }
        sectionDragDelta = sectionOrigins.size > 0 ? { x: dx, y: dy } : null;
        render();
      },
      (up) => {
        const current = gesture?.kind === "move" ? gesture : null;
        guides = [];
        sectionDragDelta = null;
        endGesture();
        dispatch({ type: "layout-interacting", interacting: false });
        if (!current) {
          render();
          return;
        }

        if (current.moved) {
          const totalDx = up.clientX - start.x;
          const totalDy = up.clientY - start.y;
          // Sections snap back when the whole gesture stayed under the
          // threshold — a click that wobbled, not a move.
          const committed = Math.abs(totalDx) >= SNAP_THRESHOLD || Math.abs(totalDy) >= SNAP_THRESHOLD;
          if (sectionOrigins.size > 0 && rearrange) {
            rearrange = {
              ...rearrange,
              sections: rearrange.sections.map((section) => {
                const origin = sectionOrigins.get(section.id);
                if (!origin) return section;
                const next = committed
                  ? { x: Math.max(0, origin.x + current.lastDx), y: Math.max(0, origin.y + current.lastDy) }
                  : origin;
                return { ...section, currentRect: { ...section.currentRect, x: next.x, y: next.y } };
              }),
            };
            reportRearrange();
            if (committed) for (const id of sectionOrigins.keys()) syncSection(id);
          }
          if (placementOrigins.size > 0) {
            for (const placement of placements) {
              if (placementOrigins.has(placement.id) || current.duplicated) syncPlacement(placement.id);
            }
          }
        }
        render();
      },
    );

    gesture = {
      kind: "move",
      start,
      placementOrigins,
      sectionOrigins,
      duplicated: false,
      moved: false,
      lastDx: 0,
      lastDy: 0,
      controller: gestureController,
    };
  }

  // --- Resize ----------------------------------------------------------------

  function startPlacementResize(id: string, direction: HandleDir, event: PointerEvent): void {
    const placement = placements.find((candidate) => candidate.id === id);
    if (!placement) return;
    clearSelection();
    selection.placements.add(id);
    dispatch({ type: "layout-interacting", interacting: true });
    const start: Point = { x: event.clientX, y: event.clientY };
    const startBox = { x: placement.x, y: placement.y, width: placement.width, height: placement.height };
    const edges = edgesForHandle(direction);

    const gestureController = trackGesture(
      (move) => {
        const resized = resizeRect(startBox, direction, move.clientX - start.x, move.clientY - start.y);
        const snap = computeSnap(resized, snapTargets(new Set([id]), new Set()), edges);
        guides = snap.guides;
        const box = applyResizeSnap(resized, snap, edges);
        placements = placements.map((candidate) =>
          candidate.id === id
            ? { ...candidate, x: box.x, y: box.y, width: box.width, height: box.height }
            : candidate,
        );
        sizeIndicator = {
          x: move.clientX + 12,
          y: move.clientY + 12,
          text: `${Math.round(box.width)} \u00D7 ${Math.round(box.height)}`,
        };
        reportPlacements();
        render();
      },
      () => {
        guides = [];
        sizeIndicator = null;
        endGesture();
        dispatch({ type: "layout-interacting", interacting: false });
        syncPlacement(id);
        render();
      },
    );

    gesture = { kind: "resize-placement", id, direction, start, startBox, controller: gestureController };
  }

  function startSectionResize(id: string, direction: HandleDir, event: PointerEvent): void {
    const section = rearrange?.sections.find((candidate) => candidate.id === id);
    if (!section || !rearrange) return;
    clearSelection();
    selection.sections.add(id);
    dispatch({ type: "layout-interacting", interacting: true });
    const start: Point = { x: event.clientX, y: event.clientY };
    const startBox: Box = { ...section.currentRect };
    const aspectRatio = startBox.width / startBox.height;

    const gestureController = trackGesture(
      (move) => {
        if (!rearrange) return;
        let box = resizeRect(startBox, direction, move.clientX - start.x, move.clientY - start.y);
        if (move.shiftKey) box = constrainAspectRatio(box, startBox, direction, aspectRatio);
        rearrange = {
          ...rearrange,
          sections: rearrange.sections.map((candidate) =>
            candidate.id === id ? { ...candidate, currentRect: { ...box } } : candidate,
          ),
        };
        sizeIndicator = {
          x: move.clientX + 12,
          y: move.clientY + 12,
          text: `${Math.round(box.width)} \u00D7 ${Math.round(box.height)}`,
        };
        reportRearrange();
        render();
      },
      () => {
        sizeIndicator = null;
        endGesture();
        dispatch({ type: "layout-interacting", interacting: false });
        syncSection(id);
        render();
      },
    );

    gesture = { kind: "resize-section", id, direction, start, startBox, controller: gestureController };
  }

  // --- Capture a page element -------------------------------------------------

  function captureAndDrag(target: HTMLElement, event: PointerEvent): void {
    if (!rearrange) return;
    const section = captureElement(environment, target);
    rearrange = {
      ...rearrange,
      sections: [...rearrange.sections, section],
      originalOrder: [...rearrange.originalOrder, section.id],
    };
    clearSelection();
    selection.sections.add(section.id);
    hoverBox = null;
    reportRearrange();
    dispatch({ type: "rearrange-sync", section: { ...section } });
    render();
    startMove(event);
  }

  // ---------------------------------------------------------------------------
  // Listeners
  // ---------------------------------------------------------------------------

  const options = { signal };

  // --- Palette ---------------------------------------------------------------
  palette.addEventListener("pointerdown", (event) => event.stopPropagation(), options);
  palette.addEventListener("click", (event) => event.stopPropagation(), options);

  wireframeToggle.addEventListener(
    "click",
    () => dispatch({ type: "layout-wireframe", enabled: !model?.layout.wireframe }),
    options,
  );

  purposeInput.addEventListener(
    "input",
    () => dispatch({ type: "layout-wireframe-purpose", purpose: purposeInput.value }),
    options,
  );

  paletteScroll.addEventListener("scroll", () => updateScrollFade(), { ...options, passive: true });

  for (const [type, node] of paletteItems) {
    node.addEventListener(
      "click",
      () => {
        const armed = model?.layout.activeComponent ?? null;
        dispatch({ type: "layout-select-component", component: armed === type ? null : type });
      },
      options,
    );
    node.addEventListener(
      "pointerdown",
      (event) => {
        if (event.button !== 0 || !event.isPrimary) return;
        event.preventDefault();
        endGesture();
        startPaletteDrag(type, event);
      },
      options,
    );
  }

  footerClear.addEventListener(
    "click",
    () => {
      // Animate everything out first, exactly as the original clear signals did.
      for (const placement of placements) exitingPlacements.add(placement.id);
      for (const section of rearrange?.sections ?? []) exitingSections.add(section.id);
      clearSelection();
      endGesture();
      render();
      later(() => {
        exitingPlacements.clear();
        exitingSections.clear();
        dispatch({ type: "layout-clear" });
      }, CLEAR_MS);
    },
    options,
  );

  function updateScrollFade(): void {
    const top = paletteScroll.scrollTop > 2;
    const bottom = paletteScroll.scrollTop + paletteScroll.clientHeight < paletteScroll.scrollHeight - 2;
    paletteScroll.classList.toggle("is-fade-top", top);
    paletteScroll.classList.toggle("is-fade-bottom", bottom);
  }

  const ResizeObserverCtor = (
    environment.window as Window & { ResizeObserver?: typeof ResizeObserver }
  ).ResizeObserver;
  const scrollObserver = ResizeObserverCtor ? new ResizeObserverCtor(() => updateScrollFade()) : null;
  scrollObserver?.observe(paletteScroll);

  // --- Placement overlay -----------------------------------------------------
  placementLayer.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button !== 0 || !event.isPrimary) return;
      const target = event.target;
      if (!(target instanceof environment.Element)) return;

      const resizeTarget = target.closest<HTMLElement>("[data-resize-placement]");
      if (resizeTarget) {
        event.preventDefault();
        event.stopPropagation();
        endGesture();
        startPlacementResize(
          resizeTarget.dataset.resizePlacement as string,
          resizeTarget.dataset.direction as HandleDir,
          event,
        );
        return;
      }
      if (target.closest("[data-delete-placement]")) {
        event.stopPropagation();
        return;
      }

      const placementTarget = target.closest<HTMLElement>("[data-design-placement]");
      if (placementTarget) {
        event.preventDefault();
        event.stopPropagation();
        endGesture();
        selectOne("placements", placementTarget.dataset.designPlacement as string, event.shiftKey);
        render();
        startMove(event);
        return;
      }

      const armed = activeComponent();
      if (armed === null) return; // passthrough: the page below owns this click
      event.preventDefault();
      event.stopPropagation();
      endGesture();
      startPlace(armed, event);
    },
    options,
  );

  placementLayer.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof environment.Element)) return;
      const remove = target.closest<HTMLElement>("[data-delete-placement]");
      if (!remove) return;
      event.stopPropagation();
      deletePlacements([remove.dataset.deletePlacement as string]);
    },
    options,
  );

  placementLayer.addEventListener(
    "dblclick",
    (event) => {
      const target = event.target;
      if (!(target instanceof environment.Element)) return;
      const placementTarget = target.closest<HTMLElement>("[data-design-placement]");
      if (!placementTarget) return;
      const id = placementTarget.dataset.designPlacement as string;
      const placement = placements.find((candidate) => candidate.id === id);
      if (!placement || !TEXT_TYPES[placement.type]) return;
      openEditor("placement", id);
    },
    options,
  );

  // --- Rearrange overlay -----------------------------------------------------
  rearrangeLayer.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button !== 0 || !event.isPrimary) return;
      const target = event.target;
      if (!(target instanceof environment.Element)) return;

      const resizeTarget = target.closest<HTMLElement>("[data-resize-section]");
      if (resizeTarget) {
        event.preventDefault();
        event.stopPropagation();
        endGesture();
        startSectionResize(
          resizeTarget.dataset.resizeSection as string,
          resizeTarget.dataset.direction as HandleDir,
          event,
        );
        return;
      }
      if (target.closest("[data-delete-section]")) {
        event.stopPropagation();
        return;
      }

      const sectionTarget = target.closest<HTMLElement>("[data-rearrange-section]");
      if (!sectionTarget) return;
      event.preventDefault();
      event.stopPropagation();
      endGesture();
      const additive = event.shiftKey || event.metaKey || event.ctrlKey;
      selectOne("sections", sectionTarget.dataset.rearrangeSection as string, additive);
      render();
      startMove(event);
    },
    options,
  );

  rearrangeLayer.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof environment.Element)) return;
      const remove = target.closest<HTMLElement>("[data-delete-section]");
      if (!remove) return;
      event.stopPropagation();
      deleteSections([remove.dataset.deleteSection as string]);
    },
    options,
  );

  rearrangeLayer.addEventListener(
    "dblclick",
    (event) => {
      const target = event.target;
      if (!(target instanceof environment.Element)) return;
      const sectionTarget = target.closest<HTMLElement>("[data-rearrange-section]");
      if (!sectionTarget) return;
      openEditor("section", sectionTarget.dataset.rearrangeSection as string);
    },
    options,
  );

  // --- Editor ----------------------------------------------------------------
  editorNode.addEventListener("pointerdown", (event) => event.stopPropagation(), options);
  editorCancel.addEventListener("click", () => closeEditor(), options);
  editorSubmit.addEventListener("click", () => submitEditor(editorInput.value), options);
  editorDelete.addEventListener("click", () => submitEditor(""), options);
  editorInput.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        submitEditor(editorInput.value);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeEditor();
      }
    },
    options,
  );

  // --- Page hover for capture ------------------------------------------------
  environment.document.addEventListener(
    "pointermove",
    (event) => {
      if (!model?.layout.active || gesture || model?.layout.wireframe) {
        if (hoverBox) {
          hoverBox = null;
          render();
        }
        return;
      }
      // `elementFromPoint` is absent in non-layout DOM implementations (jsdom);
      // without hit testing there is simply nothing to highlight.
      const under =
        typeof environment.document.elementFromPoint === "function"
          ? environment.document.elementFromPoint(event.clientX, event.clientY)
          : null;
      const target = under && !fromOwnUi(event) ? pickTarget(under) : null;
      const next = target && !capturedSectionFor(target) ? target.getBoundingClientRect() : null;
      const box = next ? { x: next.x, y: next.y, width: next.width, height: next.height } : null;
      const changed =
        (!box && hoverBox) ||
        (box && !hoverBox) ||
        (box &&
          hoverBox &&
          (box.x !== hoverBox.x ||
            box.y !== hoverBox.y ||
            box.width !== hoverBox.width ||
            box.height !== hoverBox.height));
      if (!changed) return;
      hoverBox = box;
      render();
    },
    { ...options, passive: true },
  );

  // Capture phase: the page must not act on a click that becomes a capture.
  environment.document.addEventListener(
    "pointerdown",
    (event) => {
      if (!model?.layout.active || gesture) return;
      if (event.button !== 0 || !event.isPrimary) return;
      if (model?.layout.wireframe) return;
      if (fromOwnUi(event)) return;

      const target = pickTarget(event.target instanceof environment.Element ? event.target : null);
      const additive = event.shiftKey || event.metaKey || event.ctrlKey;
      if (!target) {
        if (!additive && (selection.placements.size + selection.sections.size) > 0) {
          clearSelection();
          render();
        }
        return;
      }

      const captured = capturedSectionFor(target);
      if (!captured) {
        event.preventDefault();
        event.stopPropagation();
        captureAndDrag(target, event);
        return;
      }

      // Clicking the page node of an existing capture selects that section.
      event.preventDefault();
      if (elementForSection(captured) === target) {
        selectOne("sections", captured.id, additive);
        render();
        return;
      }
      if (!additive) {
        clearSelection();
        render();
      }
    },
    { ...options, capture: true },
  );

  // --- Keyboard --------------------------------------------------------------
  environment.document.addEventListener(
    "keydown",
    (event) => {
      if (!model?.layout.active) return;
      // `event.target` is the shadow host for our own fields, so read the
      // composed path to find what actually has focus.
      const focused = event.composedPath()[0];
      if (focused instanceof environment.HTMLElement) {
        const tag = focused.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || focused.isContentEditable) return;
      }

      if ((event.key === "Backspace" || event.key === "Delete") && (selection.placements.size + selection.sections.size) > 0) {
        event.preventDefault();
        event.stopPropagation();
        deletePlacements([...selection.placements]);
        deleteSections([...selection.sections]);
        return;
      }

      if (
        (event.key === "ArrowUp" ||
          event.key === "ArrowDown" ||
          event.key === "ArrowLeft" ||
          event.key === "ArrowRight") &&
        (selection.placements.size + selection.sections.size) > 0
      ) {
        event.preventDefault();
        event.stopPropagation();
        const step = event.shiftKey ? NUDGE_STEP_SHIFT : NUDGE_STEP;
        const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
        if (selection.placements.size > 0) {
          placements = placements.map((placement) =>
            selection.placements.has(placement.id)
              ? { ...placement, ...clampToOrigin({ ...{ x: placement.x, y: placement.y, width: placement.width, height: placement.height }, x: placement.x + dx, y: placement.y + dy }) }
              : placement,
          );
          reportPlacements();
        }
        if (selection.sections.size > 0 && rearrange) {
          rearrange = {
            ...rearrange,
            sections: rearrange.sections.map((section) =>
              selection.sections.has(section.id)
                ? {
                    ...section,
                    currentRect: {
                      ...section.currentRect,
                      ...clampToOrigin({
                        ...section.currentRect,
                        x: section.currentRect.x + dx,
                        y: section.currentRect.y + dy,
                      }),
                    },
                  }
                : section,
            ),
          };
          reportRearrange();
        }
        scheduleNudgeSync();
        render();
        return;
      }

      if (event.key === "Escape") {
        if (editor) {
          event.stopPropagation();
          closeEditor();
          return;
        }
        if (model?.layout.activeComponent) {
          event.stopPropagation();
          dispatch({ type: "layout-select-component", component: null });
          return;
        }
        if ((selection.placements.size + selection.sections.size) > 0) {
          event.stopPropagation();
          clearSelection();
          render();
        }
      }
    },
    { ...options, capture: true },
  );

  // --- Scroll / resize -------------------------------------------------------
  const reflow = (): void => {
    if (!model?.layout.active) return;
    render();
  };
  environment.window.addEventListener("scroll", reflow, { ...options, passive: true });
  environment.window.addEventListener("resize", reflow, { ...options, passive: true });

  // ---------------------------------------------------------------------------
  // Connector exits
  // ---------------------------------------------------------------------------

  /**
   * A section that snapped back to its original position keeps its connector on
   * screen for one fade. Only committed state can trigger this, so it runs from
   * `update()` rather than from every drag frame.
   */
  function trackConnectorExits(): void {
    const sections = rearrange?.sections ?? [];
    const changedIds = new Set<string>();
    for (const section of sections) {
      if (!rectChanged(section)) continue;
      changedIds.add(section.id);
      lastChangedRects.set(section.id, {
        current: section.currentRect,
        original: section.originalRect,
        isFixed: !!section.isFixed,
      });
    }

    const leaving: string[] = [];
    for (const id of previousChangedIds) {
      if (changedIds.has(id)) continue;
      // A deleted section fades its whole outline; no connector exit needed.
      if (!sections.some((section) => section.id === id)) continue;
      const last = lastChangedRects.get(id);
      if (!last) continue;
      exitingConnectors.set(id, { from: last.original, to: last.current, isFixed: last.isFixed });
      lastChangedRects.delete(id);
      leaving.push(id);
    }
    previousChangedIds = changedIds;

    if (leaving.length === 0) return;
    later(() => {
      for (const id of leaving) exitingConnectors.delete(id);
      render();
    }, CONNECTOR_EXIT_MS);
  }

  // ---------------------------------------------------------------------------
  // Region contract
  // ---------------------------------------------------------------------------

  let wasActive = false;

  return {
    root,

    update(nextModel: Readonly<RuntimeViewModel>, _config: Readonly<AgentationConfig>): void {
      model = nextModel;

      // A gesture owns the geometry until release; everything else still syncs.
      const owned = gesture !== null && gesture.kind !== "palette" && gesture.kind !== "select";
      if (!owned) {
        placements = nextModel.layout.placements.map((placement) => ({ ...placement }));
        rearrange = nextModel.layout.rearrange
          ? {
              ...nextModel.layout.rearrange,
              sections: nextModel.layout.rearrange.sections.map((section) => ({ ...section })),
              originalOrder: [...nextModel.layout.rearrange.originalOrder],
            }
          : null;
      }

      // Drop selections and editors for ids the runtime no longer has.
      const placementIds = new Set(placements.map((placement) => placement.id));
      for (const id of [...selection.placements]) {
        if (!placementIds.has(id)) selection.placements.delete(id);
      }
      const sectionIds = new Set((rearrange?.sections ?? []).map((section) => section.id));
      for (const id of [...selection.sections]) {
        if (!sectionIds.has(id)) selection.sections.delete(id);
      }

      const active = nextModel.layout.active;
      if (active && !wasActive) {
        // Sections restored already-moved: hold the outlines while the page
        // elements animate into place.
        const settled = !(rearrange?.sections ?? []).some(rectChanged);
        outlinesReady = settled;
        cancel(outlinesReadyTimer);
        outlinesReadyTimer = settled
          ? undefined
          : later(() => {
              outlinesReadyTimer = undefined;
              outlinesReady = true;
              render();
            }, OUTLINES_READY_MS);
        previousChangedIds = new Set(
          (rearrange?.sections ?? []).filter(rectChanged).map((section) => section.id),
        );
      } else if (!active && wasActive) {
        endGesture();
        clearSelection();
        closeEditor(true);
        hoverBox = null;
        guides = [];
        sizeIndicator = null;
        drawBox = null;
        selectBox = null;
        sectionDragDelta = null;
        firstAction.clear();
        exitingConnectors.clear();
        lastChangedRects.clear();
        previousChangedIds = new Set();
      }
      wasActive = active;

      // Leaving layout mode, or switching stash, must not leave an editor open.
      if (editor && (nextModel.layout.exiting || !active)) closeEditor(true);

      if (!owned) trackConnectorExits();
      render();
      updateScrollFade();
    },

    destroy(): void {
      endGesture();
      controller.abort();
      scrollObserver?.disconnect();
      environment.timers.cancelAnimationFrame(paletteEnterFrame);
      for (const handle of timers) environment.timers.clearTimeout(handle);
      timers.clear();
      root.remove();
    },
  };
}

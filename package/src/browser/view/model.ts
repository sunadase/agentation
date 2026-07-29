// =============================================================================
// Runtime View Model & Intents
// =============================================================================
//
// The single contract between the runtime coordinator (`browser/runtime.ts`)
// and the native DOM renderer (`browser/view.ts` plus `browser/view/*`).
//
// The coordinator owns all state and produces an immutable `RuntimeViewModel`.
// The view retains its DOM, diffs against its previous model, and reports user
// actions back as `ViewIntent` values. Regions never read runtime internals and
// never mutate the model.
// =============================================================================

import type { Annotation, OutputDetailLevel } from "../../types";
import type { AgentationConfig } from "../types";
import type {
  ComponentType,
  DesignPlacement,
  DetectedSection,
  RearrangeState,
} from "../layout/types";

// -----------------------------------------------------------------------------
// Settings
// -----------------------------------------------------------------------------

export type MarkerClickBehavior = "edit" | "delete";

/** Persisted under `feedback-toolbar-settings`. */
export type ToolbarSettings = {
  outputDetail: OutputDetailLevel;
  autoClearAfterCopy: boolean;
  annotationColorId: AccentId;
  blockInteractions: boolean;
  metadataEnabled: boolean;
  markerClickBehavior: MarkerClickBehavior;
  webhookUrl: string;
  webhooksEnabled: boolean;
};

export type AccentId = "indigo" | "blue" | "cyan" | "green" | "yellow" | "orange" | "red";

export type AccentOption = {
  id: AccentId;
  label: string;
  srgb: string;
  p3: string;
};

/** The exact seven accents of the original toolbar, in original order. */
export const ACCENT_OPTIONS: readonly AccentOption[] = [
  { id: "indigo", label: "Indigo", srgb: "#6155F5", p3: "color(display-p3 0.38 0.33 0.96)" },
  { id: "blue", label: "Blue", srgb: "#0088FF", p3: "color(display-p3 0.00 0.53 1.00)" },
  { id: "cyan", label: "Cyan", srgb: "#00C3D0", p3: "color(display-p3 0.00 0.76 0.82)" },
  { id: "green", label: "Green", srgb: "#34C759", p3: "color(display-p3 0.20 0.78 0.35)" },
  { id: "yellow", label: "Yellow", srgb: "#FFCC00", p3: "color(display-p3 1.00 0.80 0.00)" },
  { id: "orange", label: "Orange", srgb: "#FF8D28", p3: "color(display-p3 1.00 0.55 0.16)" },
  { id: "red", label: "Red", srgb: "#FF383C", p3: "color(display-p3 1.00 0.22 0.24)" },
] as const;

export const DEFAULT_SETTINGS: ToolbarSettings = {
  outputDetail: "standard",
  autoClearAfterCopy: false,
  annotationColorId: "blue",
  blockInteractions: true,
  metadataEnabled: true,
  markerClickBehavior: "edit",
  webhookUrl: "",
  webhooksEnabled: true,
};

// -----------------------------------------------------------------------------
// Editor (pending add / edit popup)
// -----------------------------------------------------------------------------

/** Everything a target contributes to an annotation, minus identity/comment. */
export type CollectedTarget = Omit<Annotation, "id" | "comment" | "timestamp"> & {
  /** Filtered computed styles for the popup accordion. */
  computedStylesObject?: Record<string, string>;
};

export type EditorState = {
  mode: "add" | "edit";
  /** Anchor in the same coordinate space as an annotation (x = % of width). */
  x: number;
  y: number;
  isFixed: boolean;
  element: string;
  selectedText?: string;
  draft: string;
  isMultiSelect: boolean;
  computedStyles?: Record<string, string>;
  /** Present for `mode: "edit"`. */
  annotationId?: string;
  /** True while the exit animation plays. */
  exiting: boolean;
};

// -----------------------------------------------------------------------------
// Overlay geometry
// -----------------------------------------------------------------------------

export type Box = { x: number; y: number; width: number; height: number };

export type HoverState = {
  /** Combined display name (component path + element). */
  label: string;
  elementName: string;
  componentPath?: string;
  rect: Box;
  pointer: { x: number; y: number };
};

export type OutlineKind = "single" | "multi";

export type Outline = {
  kind: OutlineKind;
  /** Viewport coordinates. */
  rect: Box;
};

// -----------------------------------------------------------------------------
// Layout mode
// -----------------------------------------------------------------------------

export type LayoutViewState = {
  active: boolean;
  /** True while overlays animate out after leaving layout mode. */
  exiting: boolean;
  wireframe: boolean;
  wireframeReady: boolean;
  wireframeOpacity: number;
  wireframePurpose: string;
  activeComponent: ComponentType | null;
  placements: readonly DesignPlacement[];
  rearrange: RearrangeState | null;
  interacting: boolean;
};

// -----------------------------------------------------------------------------
// The model
// -----------------------------------------------------------------------------

export type ConnectionStatus = "disconnected" | "connecting" | "connected";
export type SendState = "idle" | "sending" | "sent" | "failed";
export type SettingsPage = "main" | "automations";

export type RuntimeViewModel = {
  // Shell
  active: boolean;
  hidden: boolean;
  hiding: boolean;
  entrance: boolean;
  theme: "dark" | "light";
  settings: Readonly<ToolbarSettings>;
  /** Persisted drag position; `null` means CSS-variable placement. */
  toolbarPosition: { x: number; y: number } | null;
  dragging: boolean;

  // Panels
  settingsOpen: boolean;
  settingsPage: SettingsPage;
  tooltipsHidden: boolean;
  tooltipSession: boolean;

  // Data
  annotations: readonly Annotation[];
  exitingAnnotationIds: ReadonlySet<string>;
  animatedAnnotationIds: ReadonlySet<string>;
  renumberFrom: number | null;

  // Editing
  editor: EditorState | null;

  // Interaction feedback
  markersVisible: boolean;
  markersExiting: boolean;
  hover: HoverState | null;
  /** Marker whose target outline is showing. */
  hoveredAnnotationId: string | null;
  outlines: readonly Outline[];
  /** Drag-selection rectangle in viewport coordinates. */
  dragSelection: Box | null;
  dragHighlights: readonly Box[];
  scrolling: boolean;

  // Modes
  frozen: boolean;
  layout: LayoutViewState;

  // Connectivity
  hasEndpoint: boolean;
  connection: ConnectionStatus;
  sendState: SendState;
  copied: boolean;
  /** Adapter IDs shown in the Component Metadata tooltip. */
  metadataAdapterIds: readonly string[];
  /** Transient status line, e.g. a recoverable error. */
  toast: string | null;
};

// -----------------------------------------------------------------------------
// Intents
// -----------------------------------------------------------------------------

export type ViewIntent =
  // Shell
  | { type: "activate" }
  | { type: "deactivate" }
  | { type: "toggle-freeze" }
  | { type: "toggle-markers" }
  | { type: "toggle-layout" }
  | { type: "toggle-settings" }
  | { type: "settings-page"; page: SettingsPage }
  | { type: "toggle-theme" }
  | { type: "hide-until-restart" }
  | { type: "copy" }
  | { type: "submit" }
  | { type: "clear" }
  | { type: "tooltips-hidden"; hidden: boolean }
  | { type: "tooltip-session"; active: boolean }
  // Toolbar drag
  | { type: "drag-start"; pointerX: number; pointerY: number }
  | { type: "drag-move"; pointerX: number; pointerY: number }
  | { type: "drag-end" }
  // Settings
  | { type: "settings-change"; patch: Partial<ToolbarSettings> }
  // Editor
  | { type: "editor-input"; draft: string }
  | { type: "editor-submit"; draft: string }
  | { type: "editor-cancel" }
  | { type: "editor-delete" }
  // Markers
  | { type: "marker-click"; id: string }
  | { type: "marker-context"; id: string }
  | { type: "marker-hover"; id: string | null }
  // Layout — palette
  | { type: "layout-select-component"; component: ComponentType | null }
  | { type: "layout-drop-component"; component: ComponentType; clientX: number; clientY: number }
  | { type: "layout-wireframe"; enabled: boolean }
  | { type: "layout-wireframe-purpose"; purpose: string }
  | { type: "layout-wireframe-opacity"; opacity: number }
  | { type: "layout-clear" }
  | { type: "layout-start-over" }
  | { type: "layout-interacting"; interacting: boolean }
  // Layout — placements
  | { type: "placements-change"; placements: readonly DesignPlacement[] }
  | { type: "placement-sync"; placement: DesignPlacement }
  | { type: "placement-delete"; id: string }
  // Layout — rearrangement
  | { type: "rearrange-change"; state: RearrangeState }
  | { type: "rearrange-sync"; section: DetectedSection }
  | { type: "rearrange-delete"; id: string };

export type ViewDispatch = (intent: ViewIntent) => void;

// -----------------------------------------------------------------------------
// Region contract
// -----------------------------------------------------------------------------

export interface ViewRegion {
  /** Retained root node, appended to the shadow root once at construction. */
  readonly root: HTMLElement;
  update(model: Readonly<RuntimeViewModel>, config: Readonly<AgentationConfig>): void;
  destroy(): void;
}

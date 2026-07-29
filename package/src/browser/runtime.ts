// =============================================================================
// Native Agentation Runtime
// =============================================================================
//
// The framework-neutral product runtime: a custom element that owns all state
// and drives the retained Shadow-DOM view in `browser/view.ts`.
//
// Responsibility split, deliberately narrow so no module needs to know another's
// internals:
//
//   environment.ts  every realm capability (DOM, storage, network, timers)
//   storage.ts      persistence, migration, retention
//   sync.ts         endpoint/session resolution, health poll, SSE, upload
//   targeting.ts    pointer/selection/area -> annotation payload
//   view.ts         retained DOM; reports `ViewIntent`, never reads state
//   layout/*        geometry, skeletons and layout-mode output
//
// This file is the only place that sequences them, and the only place that
// mutates page elements (layout mode's captured sections).
// =============================================================================

import type { Annotation, OutputDetailLevel } from "../types";
import { closestCrossingShadow } from "../utils/element-identification";
import {
  createAnimationFreezeController,
  type AnimationFreezeController,
} from "../utils/freeze-animations";
import { generateOutput } from "../utils/generate-output";
import { createRuntimeEnvironment, type RuntimeEnvironment } from "./environment";
import { generateDesignOutput, generateRearrangeOutput } from "./layout/output";
import {
  DEFAULT_SIZES,
  type ComponentType,
  type DesignPlacement,
  type DetectedSection,
  type RearrangeState,
} from "./layout/types";
import { createRuntimeStorage, type RuntimeStorage, type StorageFailure } from "./storage";
import { createRuntimeSync, type ConnectionStatus, type RuntimeSync } from "./sync";
import {
  collectArea,
  collectGroup,
  collectTarget,
  deepElementFromPoint,
  type TargetContext,
} from "./targeting";
import type {
  AgentationConfig,
  AgentationController,
  AgentationElement,
  AgentationEvent,
  AgentationEventDetail,
} from "./types";
import { createNativeAgentationView, type NativeAgentationView } from "./view";
import {
  ACCENT_OPTIONS,
  type Box,
  type CollectedTarget,
  type EditorState,
  type HoverState,
  type LayoutViewState,
  type Outline,
  type RuntimeViewModel,
  type SendState,
  type SettingsPage,
  type ToolbarSettings,
  type ViewIntent,
} from "./view/model";

const TAG_NAME = "agentation-overlay";

/** One runtime per document; a second mount is a consumer bug, not a feature. */
const instances = new WeakMap<Document, NativeAgentation>();

/** Pointer travel that turns a click into a drag selection, from the oracle. */
const DRAG_THRESHOLD = 8;

/** Pointer travel before a toolbar pointerdown becomes a drag. */
const TOOLBAR_DRAG_THRESHOLD = 10;

/** Gap kept between a dragged toolbar and the viewport edge. */
const TOOLBAR_VIEWPORT_PADDING = 20;

/**
 * Controls whose own behaviour competes with annotating. `blockInteractions`
 * decides which side wins; everything else is always annotatable.
 */
const INTERACTIVE_SELECTOR =
  'button, a, input, select, textarea, [role="button"], [onclick]';

/**
 * Elements whose text a user plausibly wants to select. Starting an area drag
 * here would fight the browser's own selection, and the selection is what a
 * later annotation captures.
 */
const TEXT_SELECTION_SELECTOR =
  "p, h1, h2, h3, h4, h5, h6, span, li, td, th, dt, dd, blockquote, figcaption," +
  " label, code, pre, em, strong, small, [contenteditable]";

/** Click suppression window after a drag gesture ends. */
const CLICK_SUPPRESSION_MS = 250;

const TOAST_MS = 2400;
const COPIED_MS = 2000;
const SENT_MS = 2000;
const MARKER_EXIT_MS = 250;
const RENUMBER_MS = 200;
const ENTRANCE_MS = 750;
const HIDE_MS = 300;
const ROUTE_POLL_MS = 400;
const SCROLL_IDLE_MS = 120;

/** Grid density used to find elements inside a drag rectangle. */
const AREA_PROBE_MAX = 8;

/** Toolbar footprint used to clamp a dragged position into the viewport. */
const TOOLBAR_WIDTH = 337;
const TOOLBAR_HEIGHT = 44;

type MoveBackup = {
  element: HTMLElement;
  transform: string;
  transformOrigin: string;
  transition: string;
  position: string;
  zIndex: string;
};

function validHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function emptyRearrange(now: number): RearrangeState {
  return { sections: [], originalOrder: [], detectedAt: now };
}

class NativeAgentation {
  private readonly host: AgentationElement;
  private readonly environment: RuntimeEnvironment;
  private readonly storage: RuntimeStorage;
  private readonly freeze: AnimationFreezeController;
  private readonly view: NativeAgentationView;
  private readonly sync: RuntimeSync;
  private readonly abort: AbortController;

  private config: AgentationConfig = {};
  private destroyed = false;
  private route = "";

  // --- Shell ----------------------------------------------------------------
  private settings: ToolbarSettings;
  private theme: "dark" | "light";
  private toolbarPosition: { x: number; y: number } | null;
  private active = false;
  private hidden: boolean;
  private hiding = false;
  private entrance = false;
  private settingsOpen = false;
  private settingsPage: SettingsPage = "main";
  private tooltipsHidden = false;
  private tooltipSession = false;

  // --- Data -----------------------------------------------------------------
  private annotations: Annotation[] = [];
  private readonly exitingAnnotationIds = new Set<string>();
  private readonly animatedAnnotationIds = new Set<string>();
  private renumberFrom: number | null = null;

  // --- Editing --------------------------------------------------------------
  private editor: EditorState | null = null;
  private pendingTarget: CollectedTarget | null = null;

  // --- Interaction ----------------------------------------------------------
  private markersVisible = true;
  private markersExiting = false;
  private hover: HoverState | null = null;
  private hoveredAnnotationId: string | null = null;
  private outlines: Outline[] = [];
  private dragOrigin: { x: number; y: number } | null = null;
  private dragSelection: Box | null = null;
  private dragHighlights: Box[] = [];
  private dragElements: HTMLElement[] = [];
  private scrolling = false;
  private suppressClickUntil = 0;
  private toolbarDrag: { pointerX: number; pointerY: number; moved: boolean } | null = null;
  /** Targets accumulated by modifier-clicking, committed when a modifier lifts. */
  private multiSelect: HTMLElement[] = [];

  // --- Layout mode ----------------------------------------------------------
  private layoutActive = false;
  private layoutExiting = false;
  private wireframe = false;
  private wireframeReady = false;
  private wireframeOpacity = 1;
  private wireframePurpose = "";
  private activeComponent: ComponentType | null = null;
  private placements: DesignPlacement[] = [];
  private rearrange: RearrangeState;
  private layoutInteracting = false;
  private readonly rearrangedElements = new Map<string, MoveBackup>();

  // --- Connectivity ---------------------------------------------------------
  private connection: ConnectionStatus = "disconnected";
  private sendState: SendState = "idle";
  private copied = false;
  private toast: string | null = null;

  // --- Timers ---------------------------------------------------------------
  private toastTimer: number | undefined;
  private copiedTimer: number | undefined;
  private sendTimer: number | undefined;
  private entranceTimer: number | undefined;
  private hideTimer: number | undefined;
  private renumberTimer: number | undefined;
  private scrollTimer: number | undefined;
  private routeTimer: number | undefined;
  private layoutExitTimer: number | undefined;
  private markerHideTimer: number | undefined;
  private readonly markerExitTimers = new Map<string, number>();

  constructor(host: AgentationElement, config: AgentationConfig) {
    this.host = host;
    this.environment = createRuntimeEnvironment(host.ownerDocument);
    this.abort = new this.environment.AbortController();
    this.storage = createRuntimeStorage(this.environment, (failure) =>
      this.onStorageFailure(failure),
    );
    this.freeze = createAnimationFreezeController(this.environment.document);
    this.view = createNativeAgentationView(this.environment, host, (intent) =>
      this.dispatch(intent),
    );

    this.settings = this.storage.loadSettings();
    this.theme = this.storage.loadTheme();
    this.toolbarPosition = this.storage.loadToolbarPosition();
    this.hidden = this.storage.loadToolbarHidden();
    this.rearrange = emptyRearrange(this.environment.now());

    this.sync = createRuntimeSync({
      environment: this.environment,
      scheduler: this.freeze.scheduler,
      storage: this.storage,
      localAnnotations: () => this.annotations,
      onRemoteAnnotations: (records) => this.mergeRemote(records),
      onRemoteRemoved: (id) => this.removeRemote(id),
      onConnectionChange: (status) => {
        this.connection = status;
        this.render();
      },
      onSessionCreated: (sessionId) => {
        this.emit({ type: "session-created", sessionId });
        this.config.onSessionCreated?.(sessionId);
      },
      onError: (message, cause) => this.emitError("sync", message, true, cause),
    });

    this.route = this.currentRoute();
    this.loadRouteState();
    this.applyAccent();
    this.installListeners();
    this.configure(config);

    // The entrance animation runs once per page load, not per SPA navigation.
    this.entrance = true;
    this.entranceTimer = this.freeze.scheduler.setTimeout(() => {
      this.entrance = false;
      this.render();
    }, ENTRANCE_MS);

    this.render();
  }

  // ===========================================================================
  // Public surface
  // ===========================================================================

  configure(config: AgentationConfig): void {
    if (this.destroyed) throw new Error("Agentation controller has been destroyed");
    if (config.endpoint && !validHttpUrl(config.endpoint)) {
      throw new TypeError("Agentation endpoint must be an http(s) URL");
    }
    if (config.webhookUrl && !validHttpUrl(config.webhookUrl)) {
      throw new TypeError("Agentation webhookUrl must be an http(s) URL");
    }

    const previousClassName = this.config.className;
    this.config = config;
    if (previousClassName !== config.className) {
      if (previousClassName) this.host.classList.remove(...previousClassName.split(/\s+/));
      if (config.className) this.host.classList.add(...config.className.split(/\s+/));
    }

    void this.sync.configure(config, this.route, this.annotations);
    if (config.enableDemoMode) this.scheduleDemo();
    this.render();
  }

  getAnnotations(): readonly Annotation[] {
    return this.annotations.map((annotation) => ({ ...annotation }));
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.abort.abort();
    this.sync.destroy();
    this.restoreRearrangedElements();

    for (const handle of this.markerExitTimers.values()) {
      this.freeze.scheduler.clearTimeout(handle);
    }
    this.markerExitTimers.clear();
    for (const handle of [
      this.toastTimer,
      this.copiedTimer,
      this.sendTimer,
      this.entranceTimer,
      this.hideTimer,
      this.renumberTimer,
      this.scrollTimer,
      this.routeTimer,
      this.layoutExitTimer,
      this.markerHideTimer,
    ]) {
      this.freeze.scheduler.clearTimeout(handle);
    }

    // Unfreeze before destroy: the controller only uninstalls the window timer
    // wrappers once no live instance still holds a freeze.
    this.freeze.unfreeze();
    this.freeze.destroy();
    this.view.destroy();
    instances.delete(this.environment.document);
  }

  // ===========================================================================
  // Route
  // ===========================================================================

  private currentRoute(): string {
    const { location } = this.environment.window;
    return `${location.pathname}${location.search}${location.hash}`;
  }

  private checkRoute(): void {
    const next = this.currentRoute();
    if (next === this.route) return;
    this.restoreRearrangedElements();
    this.route = next;
    this.loadRouteState();
    void this.sync.configure(this.config, this.route, this.annotations);
    this.render();
  }

  private loadRouteState(): void {
    this.annotations = this.storage.loadAnnotations(this.route);
    this.placements = this.storage.loadPlacements(this.route);
    this.rearrange =
      this.storage.loadRearrange(this.route) ?? emptyRearrange(this.environment.now());
    this.wireframePurpose = this.storage.loadWireframe(this.route)?.purpose ?? "";
    // Markers restored from storage must not replay the enter animation.
    this.animatedAnnotationIds.clear();
    for (const annotation of this.annotations) this.animatedAnnotationIds.add(annotation.id);
    this.emitAnnotations("load", this.annotations);
  }

  private saveRouteState(): void {
    this.storage.saveAnnotations(this.route, this.annotations, this.sync.sessionId ?? undefined);
    if (this.wireframe) {
      this.storage.saveWireframe(this.route, {
        rearrange: this.rearrange,
        placements: this.placements,
        purpose: this.wireframePurpose,
      });
    } else {
      this.storage.savePlacements(this.route, this.placements);
      this.storage.saveRearrange(this.route, this.rearrange);
    }
  }

  // ===========================================================================
  // Listeners
  // ===========================================================================

  private installListeners(): void {
    const { signal } = this.abort;
    const document = this.environment.document;
    const view = this.environment.window;

    document.addEventListener("mousemove", (event) => this.onPointerMove(event), { signal });
    document.addEventListener("mousedown", (event) => this.onPointerDown(event), { signal });
    document.addEventListener("mouseup", (event) => this.onPointerUp(event), { signal });
    // Capture phase: a page handler must not act on a click the toolbar claims.
    document.addEventListener("click", (event) => this.onClick(event), {
      signal,
      capture: true,
    });
    document.addEventListener("keydown", (event) => this.onKeyDown(event), { signal });
    document.addEventListener("keyup", (event) => this.onKeyUp(event), { signal });
    // Losing the window drops the modifiers without a keyup, which would leave a
    // modifier selection stranded and visible.
    view.addEventListener("blur", () => this.cancelMultiSelect(), { signal });
    view.addEventListener("scroll", () => this.onScroll(), { signal, passive: true });
    view.addEventListener("resize", () => this.render(), { signal, passive: true });

    // `pushState`/`replaceState` fire no event, so the route is polled. The
    // unfrozen scheduler keeps this alive while the page is frozen.
    const poll = (): void => {
      if (this.destroyed) return;
      this.checkRoute();
      this.routeTimer = this.freeze.scheduler.setTimeout(poll, ROUTE_POLL_MS);
    };
    this.routeTimer = this.freeze.scheduler.setTimeout(poll, ROUTE_POLL_MS);
  }

  /** True when the event originated inside Agentation's own UI. */
  private ownsEvent(event: Event): boolean {
    return event.composedPath().includes(this.host);
  }

  private get targetContext(): TargetContext {
    return {
      environment: this.environment,
      host: this.host,
      adapters: this.config.metadata ?? [],
      metadataEnabled: this.settings.metadataEnabled,
      outputDetail: this.settings.outputDetail,
      onMetadataError: (adapterId, cause) =>
        this.emitError("metadata", `Metadata adapter "${adapterId}" failed`, true, cause),
    };
  }

  private onScroll(): void {
    this.scrolling = true;
    this.freeze.scheduler.clearTimeout(this.scrollTimer);
    this.scrollTimer = this.freeze.scheduler.setTimeout(() => {
      this.scrolling = false;
      this.render();
    }, SCROLL_IDLE_MS);
    this.render();
  }

  private onPointerMove(event: MouseEvent): void {
    if (this.toolbarDrag) return;

    if (this.dragOrigin) {
      this.updateDragSelection(event);
      return;
    }

    if (!this.active || this.editor || this.layoutActive || this.ownsEvent(event)) {
      if (this.hover) {
        this.hover = null;
        this.render();
      }
      return;
    }

    const element = deepElementFromPoint(event.clientX, event.clientY, this.targetContext);
    if (!element) {
      if (this.hover) {
        this.hover = null;
        this.render();
      }
      return;
    }

    const target = collectTarget(element, event.clientX, event.clientY, this.targetContext);
    this.hover = {
      label: target.element,
      elementName: target.element,
      componentPath: target.framework?.componentPath?.join(" "),
      rect: this.viewportBox(element.getBoundingClientRect()),
      pointer: { x: event.clientX, y: event.clientY },
    };
    this.render();
  }

  private updateDragSelection(event: MouseEvent): void {
    const origin = this.dragOrigin;
    if (!origin) return;
    const width = Math.abs(event.clientX - origin.x);
    const height = Math.abs(event.clientY - origin.y);
    if (width <= DRAG_THRESHOLD && height <= DRAG_THRESHOLD) return;

    this.dragSelection = {
      x: Math.min(origin.x, event.clientX),
      y: Math.min(origin.y, event.clientY),
      width,
      height,
    };
    this.dragElements = this.elementsInRect(this.dragSelection);
    this.dragHighlights = this.dragElements.map((element) =>
      this.viewportBox(element.getBoundingClientRect()),
    );
    this.hover = null;
    this.render();
  }

  private onPointerDown(event: MouseEvent): void {
    if (!this.active || this.editor || this.layoutActive) return;
    if (event.button !== 0 || this.ownsEvent(event)) return;

    const element = deepElementFromPoint(event.clientX, event.clientY, this.targetContext);
    // Text stays natively selectable: an area drag here would clobber the
    // selection that a subsequent annotation is supposed to capture.
    if (element && closestCrossingShadow(element, TEXT_SELECTION_SELECTOR)) return;

    this.dragOrigin = { x: event.clientX, y: event.clientY };
  }

  private onPointerUp(event: MouseEvent): void {
    const origin = this.dragOrigin;
    const selection = this.dragSelection;
    this.dragOrigin = null;
    if (!origin || !selection) return;

    // The click that ends a drag must not also open a single-element editor.
    this.suppressClickUntil = this.environment.monotonic() + CLICK_SUPPRESSION_MS;

    const elements = this.dragElements;
    this.dragSelection = null;
    this.dragHighlights = [];
    this.dragElements = [];

    // A rectangle covering real elements groups them; an empty one annotates the
    // region itself. Both are the oracle's mouseup behaviour.
    const target =
      elements.length > 0
        ? collectGroup(elements, this.targetContext)
        : collectArea(
            new this.environment.DOMRect(
              selection.x,
              selection.y,
              selection.width,
              selection.height,
            ),
            this.targetContext,
          );

    if (!target) {
      this.render();
      return;
    }
    this.openEditor(target);
  }

  private onClick(event: MouseEvent): void {
    if (!this.active || this.layoutActive || this.editor) return;
    if (this.ownsEvent(event)) return;
    if (this.environment.monotonic() < this.suppressClickUntil) return;

    const element = deepElementFromPoint(event.clientX, event.clientY, this.targetContext);
    if (!element) return;

    const primary = this.environment.isApplePlatform ? event.metaKey : event.ctrlKey;
    if (primary && event.shiftKey) {
      // Modifier selection accumulates targets instead of opening the popup.
      event.preventDefault();
      event.stopPropagation();
      this.toggleMultiSelect(element);
      this.render();
      return;
    }

    if (closestCrossingShadow(element, INTERACTIVE_SELECTOR)) {
      // With blocking off, the control is the user's: it acts and is not
      // annotated. With blocking on, the click is consumed and annotated.
      if (!this.settings.blockInteractions) return;
      event.preventDefault();
      event.stopPropagation();
    }

    const target = collectTarget(element, event.clientX, event.clientY, this.targetContext);
    this.openEditor(target);
  }

  // ===========================================================================
  // Modifier selection
  // ===========================================================================

  private toggleMultiSelect(element: HTMLElement): void {
    const index = this.multiSelect.indexOf(element);
    if (index === -1) this.multiSelect.push(element);
    else this.multiSelect.splice(index, 1);
    this.outlines = this.multiSelect.map((selected) => ({
      kind: "multi" as const,
      rect: this.viewportBox(selected.getBoundingClientRect()),
    }));
  }

  private cancelMultiSelect(): void {
    if (this.multiSelect.length === 0) return;
    this.multiSelect = [];
    this.outlines = [];
    this.render();
  }

  /**
   * Releasing either modifier ends the gesture: one target becomes an ordinary
   * annotation, several become a single grouped one.
   */
  private commitMultiSelect(): void {
    const elements = this.multiSelect;
    this.multiSelect = [];
    if (elements.length === 0) return;

    if (elements.length === 1) {
      const rect = elements[0].getBoundingClientRect();
      this.openEditor(
        collectTarget(
          elements[0],
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
          this.targetContext,
        ),
      );
      return;
    }
    this.openEditor(collectGroup(elements, this.targetContext));
  }

  private onKeyUp(event: KeyboardEvent): void {
    if (this.multiSelect.length === 0) return;
    const primary = this.environment.isApplePlatform ? event.metaKey : event.ctrlKey;
    if (primary && event.shiftKey) return;
    this.commitMultiSelect();
    this.render();
  }

  private onKeyDown(event: KeyboardEvent): void {
    // Ownership is deliberately NOT a blanket bail here. Clicking the collapsed
    // circle leaves focus on the toolbar shell, and a control keeps focus after
    // it is pressed, so a `composedPath()` test made every documented shortcut
    // dead until the user clicked the page again. Agentation's own text entry is
    // handled below instead: the popup textarea stops propagation outright, and
    // the settings/layout fields are covered by the `typing` guard.
    const target = event.target;
    const typing =
      target instanceof this.environment.HTMLInputElement ||
      target instanceof this.environment.HTMLTextAreaElement ||
      target instanceof this.environment.HTMLSelectElement ||
      (target instanceof this.environment.HTMLElement && target.isContentEditable);

    const modifier = this.environment.isApplePlatform ? event.metaKey : event.ctrlKey;
    if (modifier && event.shiftKey && (event.key === "f" || event.key === "F")) {
      event.preventDefault();
      if (this.active) this.deactivate();
      else this.activate();
      this.render();
      return;
    }

    if (event.key === "Escape") {
      // A text field Agentation owns cancels itself; unwinding the whole toolbar
      // from under it would lose the value the user was editing.
      if (typing && this.ownsEvent(event)) return;
      // Unwind one level at a time, innermost first: an armed layout tool, then
      // layout mode, then a modifier selection or popup, then feedback mode.
      if (this.layoutActive && this.activeComponent) this.activeComponent = null;
      else if (this.layoutActive) this.leaveLayout();
      else if (this.multiSelect.length > 0) this.cancelMultiSelect();
      else if (this.editor) this.closeEditor();
      else if (this.settingsOpen) this.settingsOpen = false;
      else if (this.active) this.deactivate();
      else return;
      this.render();
      return;
    }

    if (!this.active) return;

    // Typing in any field must never trigger a single-letter shortcut.
    if (typing || event.metaKey || event.ctrlKey || event.altKey) return;

    switch (event.key) {
      case "p":
      case "P":
        this.toggleFreeze();
        break;
      case "l":
      case "L":
        this.toggleLayout();
        break;
      case "h":
      case "H":
        if (this.annotations.length === 0) return;
        this.toggleMarkers();
        break;
      case "c":
      case "C":
        void this.copyOutput(false);
        break;
      case "s":
      case "S":
        void this.copyOutput(true);
        break;
      case "x":
      case "X":
        void this.clearAll();
        break;
      default:
        return;
    }
    event.preventDefault();
    this.tooltipsHidden = true;
    this.render();
  }

  // ===========================================================================
  // Geometry
  // ===========================================================================

  private viewportBox(rect: DOMRect): Box {
    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
  }

  /**
   * Elements meaningfully inside a drag rectangle. The original probed a grid of
   * hit-test points rather than walking the DOM, which naturally respects
   * stacking and overflow clipping; the same probe density is kept here.
   */
  private elementsInRect(rect: Box): HTMLElement[] {
    const columns = Math.max(2, Math.min(AREA_PROBE_MAX, Math.ceil(rect.width / 80)));
    const rows = Math.max(2, Math.min(AREA_PROBE_MAX, Math.ceil(rect.height / 60)));
    const found: HTMLElement[] = [];
    const seen = new Set<HTMLElement>();

    for (let row = 0; row <= rows; row += 1) {
      for (let column = 0; column <= columns; column += 1) {
        const x = rect.x + (rect.width * column) / columns;
        const y = rect.y + (rect.height * row) / rows;
        const element = deepElementFromPoint(x, y, this.targetContext);
        if (!element || seen.has(element)) continue;
        seen.add(element);

        const box = element.getBoundingClientRect();
        if (box.width < 4 || box.height < 4) continue;
        // Keep the outermost element of each subtree: a group annotation should
        // name the card, not every span inside it.
        if (found.some((existing) => existing.contains(element))) continue;
        for (let index = found.length - 1; index >= 0; index -= 1) {
          if (element.contains(found[index])) found.splice(index, 1);
        }
        found.push(element);
      }
    }
    return found;
  }

  // ===========================================================================
  // Intents
  // ===========================================================================

  private dispatch(intent: ViewIntent): void {
    if (this.destroyed) return;

    switch (intent.type) {
      case "activate":
        this.activate();
        break;
      case "deactivate":
        this.deactivate();
        break;
      case "toggle-freeze":
        this.toggleFreeze();
        break;
      case "toggle-markers":
        this.toggleMarkers();
        break;
      case "toggle-layout":
        this.toggleLayout();
        break;
      case "toggle-settings":
        this.settingsOpen = !this.settingsOpen;
        if (!this.settingsOpen) this.settingsPage = "main";
        break;
      case "settings-page":
        this.settingsPage = intent.page;
        break;
      case "toggle-theme":
        this.theme = this.theme === "dark" ? "light" : "dark";
        this.storage.saveTheme(this.theme);
        this.applyAccent();
        break;
      case "hide-until-restart":
        this.hideUntilRestart();
        break;
      case "copy":
        void this.copyOutput(false);
        break;
      case "submit":
        void this.copyOutput(true);
        break;
      case "clear":
        void this.clearAll();
        break;
      case "tooltips-hidden":
        this.tooltipsHidden = intent.hidden;
        break;
      case "tooltip-session":
        this.tooltipSession = intent.active;
        break;
      case "drag-start":
        this.toolbarDrag = {
          pointerX: intent.pointerX,
          pointerY: intent.pointerY,
          moved: false,
        };
        break;
      case "drag-move":
        this.moveToolbar(intent.pointerX, intent.pointerY);
        break;
      case "drag-end":
        if (this.toolbarDrag?.moved && this.toolbarPosition) {
          this.storage.saveToolbarPosition(this.toolbarPosition);
          this.suppressClickUntil = this.environment.monotonic() + CLICK_SUPPRESSION_MS;
        }
        this.toolbarDrag = null;
        break;
      case "settings-change":
        this.applySettings(intent.patch);
        break;
      case "editor-input":
        if (this.editor) this.editor = { ...this.editor, draft: intent.draft };
        break;
      case "editor-submit":
        void this.commitEditor(intent.draft);
        break;
      case "editor-cancel":
        // The popup already played its 150 ms exit before reporting this.
        this.closeEditor();
        break;
      case "editor-delete": {
        const id = this.editor?.annotationId;
        this.closeEditor();
        if (id) void this.deleteAnnotation(id);
        break;
      }
      case "marker-click":
        this.onMarkerClick(intent.id);
        break;
      case "marker-context":
        void this.deleteAnnotation(intent.id);
        break;
      case "marker-hover":
        this.onMarkerHover(intent.id);
        break;
      case "layout-select-component":
        this.activeComponent = intent.component;
        break;
      case "layout-drop-component":
        this.addPlacement(intent.component, intent.clientX, intent.clientY);
        break;
      case "layout-wireframe":
        this.setWireframe(intent.enabled);
        break;
      case "layout-wireframe-purpose":
        this.wireframePurpose = intent.purpose;
        this.saveRouteState();
        break;
      case "layout-wireframe-opacity":
        this.wireframeOpacity = intent.opacity;
        break;
      case "layout-clear":
        this.clearLayout();
        break;
      case "layout-start-over":
        this.clearLayout();
        this.setWireframe(false);
        break;
      case "layout-interacting":
        this.layoutInteracting = intent.interacting;
        break;
      case "placements-change":
        this.placements = [...intent.placements];
        this.saveRouteState();
        break;
      case "placement-sync":
        void this.sync.add(this.placementAnnotation(intent.placement));
        break;
      case "placement-delete":
        this.placements = this.placements.filter((placement) => placement.id !== intent.id);
        this.saveRouteState();
        void this.sync.delete(intent.id);
        break;
      case "rearrange-change":
        this.rearrange = intent.state;
        this.applyRearrangedElements();
        this.saveRouteState();
        break;
      case "rearrange-sync":
        void this.sync.add(this.rearrangeAnnotation(intent.section));
        break;
      case "rearrange-delete":
        this.deleteRearrangeSection(intent.id);
        break;
    }

    this.render();
  }

  // ===========================================================================
  // Shell
  // ===========================================================================

  private activate(): void {
    this.active = true;
    this.hidden = false;
    this.applyAccent();
  }

  private deactivate(): void {
    this.active = false;
    this.closeEditor();
    this.settingsOpen = false;
    this.hover = null;
    this.dragOrigin = null;
    this.dragSelection = null;
    this.dragHighlights = [];
    this.dragElements = [];
    this.leaveLayout();
    if (this.freeze.frozen) this.freeze.unfreeze();
  }

  private applySettings(patch: Partial<ToolbarSettings>): void {
    this.settings = { ...this.settings, ...patch };
    this.storage.saveSettings(this.settings);
    if (patch.annotationColorId !== undefined) this.applyAccent();
  }

  private hideUntilRestart(): void {
    this.storage.saveToolbarHidden(true);
    this.hiding = true;
    this.settingsOpen = false;
    this.render();
    this.hideTimer = this.freeze.scheduler.setTimeout(() => {
      this.hiding = false;
      this.hidden = true;
      this.deactivate();
      this.render();
    }, HIDE_MS);
  }

  private toggleFreeze(): void {
    if (this.freeze.frozen) this.freeze.unfreeze();
    else this.freeze.freeze();
  }

  private toggleMarkers(): void {
    if (!this.markersVisible) {
      this.markersVisible = true;
      return;
    }
    this.markersExiting = true;
    this.freeze.scheduler.clearTimeout(this.markerHideTimer);
    this.markerHideTimer = this.freeze.scheduler.setTimeout(() => {
      this.markersExiting = false;
      this.markersVisible = false;
      this.render();
    }, MARKER_EXIT_MS);
  }

  /** Accent and theme ride on host attributes so `_tokens.scss` owns the values. */
  private applyAccent(): void {
    const accent =
      ACCENT_OPTIONS.find((option) => option.id === this.settings.annotationColorId) ??
      ACCENT_OPTIONS[1];
    this.host.setAttribute("data-agentation-accent", accent.id);
    this.host.setAttribute("data-agentation-theme", this.theme);
  }


  private moveToolbar(pointerX: number, pointerY: number): void {
    const drag = this.toolbarDrag;
    if (!drag) return;
    const dx = pointerX - drag.pointerX;
    const dy = pointerY - drag.pointerY;
    if (
      !drag.moved &&
      Math.abs(dx) < TOOLBAR_DRAG_THRESHOLD &&
      Math.abs(dy) < TOOLBAR_DRAG_THRESHOLD
    ) {
      return;
    }
    drag.moved = true;

    const base = this.toolbarPosition ?? {
      x: this.environment.innerWidth - TOOLBAR_WIDTH - TOOLBAR_VIEWPORT_PADDING,
      y: this.environment.innerHeight - TOOLBAR_HEIGHT - TOOLBAR_VIEWPORT_PADDING,
    };
    const maxX = this.environment.innerWidth - TOOLBAR_WIDTH - TOOLBAR_VIEWPORT_PADDING;
    const maxY = this.environment.innerHeight - TOOLBAR_HEIGHT - TOOLBAR_VIEWPORT_PADDING;
    this.toolbarPosition = {
      x: Math.max(TOOLBAR_VIEWPORT_PADDING, Math.min(maxX, base.x + dx)),
      y: Math.max(TOOLBAR_VIEWPORT_PADDING, Math.min(maxY, base.y + dy)),
    };
    drag.pointerX = pointerX;
    drag.pointerY = pointerY;
  }

  // ===========================================================================
  // Editor
  // ===========================================================================

  private openEditor(target: CollectedTarget): void {
    this.pendingTarget = target;
    this.editor = {
      mode: "add",
      x: target.x,
      y: target.y,
      isFixed: target.isFixed ?? false,
      element: target.element,
      selectedText: target.selectedText,
      draft: "",
      isMultiSelect: target.isMultiSelect ?? false,
      computedStyles: target.computedStylesObject,
      exiting: false,
    };
    this.hover = null;
    this.outlines = this.outlinesFor(target.boundingBox, target.isMultiSelect ?? false);
    this.render();
    this.view.focusEditor();
  }

  private closeEditor(): void {
    this.editor = null;
    this.pendingTarget = null;
    this.outlines = [];
  }

  private outlinesFor(box: Box | undefined, multi: boolean): Outline[] {
    return box ? [{ kind: multi ? "multi" : "single", rect: box }] : [];
  }

  private onMarkerClick(id: string): void {
    if (this.settings.markerClickBehavior === "delete") {
      void this.deleteAnnotation(id);
      return;
    }
    const annotation = this.annotations.find((item) => item.id === id);
    if (!annotation) return;

    this.pendingTarget = null;
    this.editor = {
      mode: "edit",
      x: annotation.x,
      y: annotation.y,
      isFixed: annotation.isFixed ?? false,
      element: annotation.element,
      selectedText: annotation.selectedText,
      draft: annotation.comment,
      isMultiSelect: annotation.isMultiSelect ?? false,
      annotationId: annotation.id,
      exiting: false,
    };
    this.outlines = this.outlinesFor(annotation.boundingBox, annotation.isMultiSelect ?? false);
    this.render();
    this.view.focusEditor();
  }

  private onMarkerHover(id: string | null): void {
    this.hoveredAnnotationId = id;
    if (!id) {
      if (!this.editor) this.outlines = [];
      return;
    }
    const annotation = this.annotations.find((item) => item.id === id);
    if (!annotation) return;

    const kind: Outline["kind"] = annotation.isMultiSelect ? "multi" : "single";
    const boxes = annotation.elementBoundingBoxes ?? [];
    this.outlines =
      boxes.length > 0
        ? boxes.map((rect) => ({ kind, rect }))
        : this.outlinesFor(annotation.boundingBox, annotation.isMultiSelect ?? false);
  }

  private async commitEditor(draft: string): Promise<void> {
    const editor = this.editor;
    const comment = draft.trim();
    if (!editor || !comment) {
      this.view.shakeEditor();
      return;
    }

    if (editor.mode === "edit" && editor.annotationId) {
      const id = editor.annotationId;
      let updated: Annotation | undefined;
      this.annotations = this.annotations.map((annotation) => {
        if (annotation.id !== id) return annotation;
        updated = { ...annotation, comment };
        return updated;
      });
      this.closeEditor();
      this.saveRouteState();
      this.render();

      if (!updated) return;
      this.emitAnnotations("update", [updated]);
      this.config.onAnnotationUpdate?.({ ...updated });
      void this.sync.update(updated);
      void this.fireWebhook("annotation.update", { annotation: updated });
      return;
    }

    const target = this.pendingTarget;
    if (!target) return;

    const annotation: Annotation = {
      ...target,
      id: this.environment.randomId("ann"),
      comment,
      timestamp: this.environment.now(),
      kind: "feedback",
    };
    // Absent from `animatedAnnotationIds`, so the marker plays its entrance.
    this.annotations = [...this.annotations, annotation];
    this.closeEditor();
    this.saveRouteState();
    this.render();

    this.emitAnnotations("add", [annotation]);
    this.config.onAnnotationAdd?.({ ...annotation });
    void this.sync.add(annotation);
    void this.fireWebhook("annotation.add", { annotation });
  }

  private async deleteAnnotation(id: string): Promise<void> {
    const annotation = this.annotations.find((item) => item.id === id);
    if (!annotation) return;

    const index = this.annotations.indexOf(annotation);
    this.exitingAnnotationIds.add(id);
    if (this.editor?.annotationId === id) this.closeEditor();
    this.render();

    const handle = this.freeze.scheduler.setTimeout(() => {
      this.markerExitTimers.delete(id);
      this.exitingAnnotationIds.delete(id);
      this.annotations = this.annotations.filter((item) => item.id !== id);
      this.animatedAnnotationIds.delete(id);
      this.saveRouteState();
      this.startRenumber(index);
      this.render();
    }, MARKER_EXIT_MS);
    this.markerExitTimers.set(id, handle);

    this.emitAnnotations("delete", [annotation]);
    this.config.onAnnotationDelete?.({ ...annotation });
    void this.sync.delete(id);
    void this.fireWebhook("annotation.delete", { annotation });
  }

  private startRenumber(from: number): void {
    this.renumberFrom = from;
    this.freeze.scheduler.clearTimeout(this.renumberTimer);
    this.renumberTimer = this.freeze.scheduler.setTimeout(() => {
      this.renumberFrom = null;
      this.render();
    }, RENUMBER_MS);
  }

  private async clearAll(): Promise<void> {
    const hadLayout = this.placements.length > 0 || this.rearrange.sections.length > 0;
    if (this.annotations.length === 0 && !hadLayout) return;

    const removed = [...this.annotations];
    const ids = removed.map((annotation) => annotation.id);

    this.annotations = [];
    this.exitingAnnotationIds.clear();
    this.animatedAnnotationIds.clear();
    this.closeEditor();
    this.clearLayout();
    this.storage.clearAnnotations(this.route);
    this.render();

    if (removed.length === 0) return;
    this.emitAnnotations("clear", removed);
    this.config.onAnnotationsClear?.(removed.map((annotation) => ({ ...annotation })));
    void this.sync.clear(ids);
    void this.fireWebhook("annotations.clear", { annotations: removed });
  }

  // ===========================================================================
  // Remote state
  // ===========================================================================

  private mergeRemote(records: readonly Annotation[]): void {
    if (records.length === 0) return;
    const byId = new Map(this.annotations.map((annotation) => [annotation.id, annotation]));
    for (const record of records) {
      // Server records were already rendered elsewhere, so they must not replay
      // the entrance animation on this client.
      this.animatedAnnotationIds.add(record.id);
      byId.set(record.id, record);
    }
    this.annotations = [...byId.values()].sort((a, b) => a.timestamp - b.timestamp);
    this.emitAnnotations("remote", records);
    this.render();
  }

  private removeRemote(id: string): void {
    if (!this.annotations.some((annotation) => annotation.id === id)) return;
    this.annotations = this.annotations.filter((annotation) => annotation.id !== id);
    this.animatedAnnotationIds.delete(id);
    this.saveRouteState();
    this.render();
  }

  // ===========================================================================
  // Layout mode
  // ===========================================================================

  private toggleLayout(): void {
    if (this.layoutActive) {
      this.leaveLayout();
      return;
    }
    this.layoutActive = true;
    this.layoutExiting = false;
    this.settingsOpen = false;
    this.closeEditor();
    this.hover = null;
    this.wireframeReady = true;
    this.applyRearrangedElements();
  }

  private leaveLayout(): void {
    if (!this.layoutActive) return;
    this.layoutActive = false;
    this.layoutExiting = true;
    this.activeComponent = null;
    this.layoutInteracting = false;
    this.restoreRearrangedElements();
    this.freeze.scheduler.clearTimeout(this.layoutExitTimer);
    this.layoutExitTimer = this.freeze.scheduler.setTimeout(() => {
      this.layoutExiting = false;
      this.render();
    }, MARKER_EXIT_MS);
  }

  private setWireframe(enabled: boolean): void {
    if (this.wireframe === enabled) return;
    this.wireframe = enabled;
    this.wireframeReady = false;

    if (enabled) {
      // Entering wireframe parks the explore-mode layout so leaving it restores
      // exactly what the user had before the blank canvas appeared.
      this.storage.savePlacements(this.route, this.placements);
      this.storage.saveRearrange(this.route, this.rearrange);
      const stash = this.storage.loadWireframe(this.route);
      this.placements = stash?.placements ?? [];
      this.rearrange = stash?.rearrange ?? emptyRearrange(this.environment.now());
      this.wireframePurpose = stash?.purpose ?? "";
      this.restoreRearrangedElements();
    } else {
      this.storage.saveWireframe(this.route, {
        rearrange: this.rearrange,
        placements: this.placements,
        purpose: this.wireframePurpose,
      });
      this.placements = this.storage.loadPlacements(this.route);
      this.rearrange =
        this.storage.loadRearrange(this.route) ?? emptyRearrange(this.environment.now());
      this.applyRearrangedElements();
    }
    this.wireframeReady = true;
  }

  private clearLayout(): void {
    this.restoreRearrangedElements();
    this.placements = [];
    this.rearrange = emptyRearrange(this.environment.now());
    this.wireframePurpose = "";
    this.activeComponent = null;
    this.storage.clearPlacements(this.route);
    this.storage.clearRearrange(this.route);
    this.storage.clearWireframe(this.route);
  }

  private addPlacement(type: ComponentType, clientX: number, clientY: number): void {
    const size = DEFAULT_SIZES[type];
    const placement: DesignPlacement = {
      id: this.environment.randomId("placement"),
      type,
      x: clientX,
      y: clientY + this.environment.scrollY,
      width: size.width,
      height: size.height,
      scrollY: this.environment.scrollY,
      timestamp: this.environment.now(),
    };
    this.placements = [...this.placements, placement];
    this.activeComponent = null;
    this.saveRouteState();
    void this.sync.add(this.placementAnnotation(placement));
  }

  private placementAnnotation(placement: DesignPlacement): Annotation {
    return {
      id: placement.id,
      x: (placement.x / this.environment.innerWidth) * 100,
      y: placement.y,
      comment: `Place a ${placement.type}`,
      element: placement.type,
      elementPath: `layout > ${placement.type}`,
      timestamp: placement.timestamp,
      kind: "placement",
      placement: {
        componentType: placement.type,
        width: placement.width,
        height: placement.height,
        scrollY: placement.scrollY,
        text: placement.text,
      },
    };
  }

  private rearrangeAnnotation(section: DetectedSection): Annotation {
    return {
      id: section.id,
      x: (section.currentRect.x / this.environment.innerWidth) * 100,
      y: section.currentRect.y,
      comment: section.note ?? `Move ${section.label}`,
      element: section.label,
      elementPath: section.selector,
      timestamp: this.environment.now(),
      kind: "rearrange",
      rearrange: {
        selector: section.selector,
        label: section.label,
        tagName: section.tagName,
        originalRect: section.originalRect,
        currentRect: section.currentRect,
      },
    };
  }

  private deleteRearrangeSection(id: string): void {
    const backup = this.rearrangedElements.get(id);
    if (backup) this.restoreElement(backup);
    this.rearrangedElements.delete(id);
    this.rearrange = {
      ...this.rearrange,
      sections: this.rearrange.sections.filter((section) => section.id !== id),
    };
    this.saveRouteState();
    void this.sync.delete(id);
  }

  /**
   * Layout mode moves real page elements. Their original inline styles are
   * captured on first move and restored verbatim on exit, so a page that styled
   * `transform` itself is handed back unchanged.
   */
  private applyRearrangedElements(): void {
    for (const section of this.rearrange.sections) {
      let backup = this.rearrangedElements.get(section.id);
      if (!backup) {
        const element = this.environment.document.querySelector<HTMLElement>(section.selector);
        if (!element) continue;
        backup = {
          element,
          transform: element.style.transform,
          transformOrigin: element.style.transformOrigin,
          transition: element.style.transition,
          position: element.style.position,
          zIndex: element.style.zIndex,
        };
        this.rearrangedElements.set(section.id, backup);
      }

      const dx = section.currentRect.x - section.originalRect.x;
      const dy = section.currentRect.y - section.originalRect.y;
      const sx = section.originalRect.width
        ? section.currentRect.width / section.originalRect.width
        : 1;
      const sy = section.originalRect.height
        ? section.currentRect.height / section.originalRect.height
        : 1;

      const style = backup.element.style;
      style.transformOrigin = "top left";
      style.transition = "none";
      // A statically positioned element ignores `z-index`, so it needs a
      // position before it can be lifted above its neighbours.
      if (style.position === "") style.position = "relative";
      style.zIndex = "9999";
      style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
    }
  }

  private restoreElement(backup: MoveBackup): void {
    const style = backup.element.style;
    style.transform = backup.transform;
    style.transformOrigin = backup.transformOrigin;
    style.transition = backup.transition;
    style.position = backup.position;
    style.zIndex = backup.zIndex;
  }

  private restoreRearrangedElements(): void {
    for (const backup of this.rearrangedElements.values()) this.restoreElement(backup);
    this.rearrangedElements.clear();
  }

  // ===========================================================================
  // Output
  // ===========================================================================

  private output(): string {
    const detail: OutputDetailLevel = this.settings.outputDetail;
    const viewport = {
      width: this.environment.innerWidth,
      height: this.environment.innerHeight,
    };
    const chunks: string[] = [];

    // A blank wireframe describes an intended layout, so annotations about the
    // hidden page content would only be misleading noise.
    if (!this.wireframe) {
      const feedback = generateOutput(
        this.annotations.filter((annotation) => (annotation.kind ?? "feedback") === "feedback"),
        this.route,
        detail,
      );
      if (feedback) chunks.push(feedback);
    }

    if (this.placements.length > 0) {
      const design = generateDesignOutput(
        this.environment,
        this.placements,
        viewport,
        { blankCanvas: this.wireframe, wireframePurpose: this.wireframePurpose },
        detail,
      );
      if (design) chunks.push(design);
    }

    if (this.rearrange.sections.length > 0) {
      const moved = generateRearrangeOutput(this.environment, this.rearrange, detail, viewport);
      if (moved) chunks.push(moved);
    }

    return chunks.join("\n\n");
  }

  private async copyOutput(submit: boolean): Promise<void> {
    const output = this.output();
    if (!output) {
      this.flash("Nothing to copy");
      return;
    }

    if (submit) {
      await this.submitOutput(output);
      return;
    }

    if (this.config.copyToClipboard !== false) {
      try {
        await this.environment.writeClipboardText(output);
      } catch (cause) {
        this.emitError("clipboard", "Could not write to the clipboard", true, cause);
        this.flash("Clipboard unavailable");
        return;
      }
    }

    this.copied = true;
    this.render();
    this.freeze.scheduler.clearTimeout(this.copiedTimer);
    this.copiedTimer = this.freeze.scheduler.setTimeout(() => {
      this.copied = false;
      this.render();
    }, COPIED_MS);

    this.emit({ type: "copy", output, annotations: this.annotations });
    this.config.onCopy?.(output);
    if (this.settings.autoClearAfterCopy) void this.clearAll();
  }

  private async submitOutput(output: string): Promise<void> {
    this.sendState = "sending";
    this.render();

    const delivered = await this.deliver(output);
    if (this.destroyed) return;

    this.sendState = delivered ? "sent" : "failed";
    this.render();
    this.freeze.scheduler.clearTimeout(this.sendTimer);
    this.sendTimer = this.freeze.scheduler.setTimeout(() => {
      this.sendState = "idle";
      this.render();
    }, SENT_MS);

    if (delivered && this.settings.autoClearAfterCopy) void this.clearAll();
  }

  /** Submit reaches every configured destination; success means at least one. */
  private async deliver(output: string): Promise<boolean> {
    const event = this.emit({ type: "submit", output, annotations: this.annotations }, true);
    // A consumer calling `preventDefault()` is taking delivery over.
    if (event.defaultPrevented) return true;

    let delivered = false;
    if (this.config.onSubmit) {
      try {
        this.config.onSubmit(
          output,
          this.annotations.map((annotation) => ({ ...annotation })),
        );
        delivered = true;
      } catch (cause) {
        this.emitError("callback", "onSubmit threw", true, cause);
      }
    }
    if (await this.sync.action(output)) delivered = true;
    if (await this.fireWebhook("submit", { output }, true)) delivered = true;
    return delivered;
  }

  private async fireWebhook(
    event: string,
    payload: Record<string, unknown>,
    force = false,
  ): Promise<boolean> {
    const target = this.settings.webhookUrl || this.config.webhookUrl;
    if (!target || !validHttpUrl(target)) return false;
    if (!this.settings.webhooksEnabled && !force) return false;

    try {
      const response = await this.environment.fetch(target, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, url: this.environment.href, ...payload }),
      });
      if (!response.ok) throw new Error(`Webhook responded ${response.status}`);
      return true;
    } catch (cause) {
      this.emitError("webhook", "Webhook delivery failed", true, cause);
      return false;
    }
  }

  // ===========================================================================
  // Demo mode
  // ===========================================================================

  private scheduleDemo(): void {
    const demos = this.config.demoAnnotations;
    if (!demos || demos.length === 0 || this.annotations.length > 0) return;

    this.freeze.scheduler.setTimeout(() => {
      if (this.destroyed || this.annotations.length > 0) return;

      const added: Annotation[] = [];
      for (const demo of demos) {
        const element = this.environment.document.querySelector<HTMLElement>(demo.selector);
        if (!element) continue;
        const rect = element.getBoundingClientRect();
        const target = collectTarget(
          element,
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
          this.targetContext,
        );
        added.push({
          ...target,
          id: this.environment.randomId("ann"),
          comment: demo.comment,
          selectedText: demo.selectedText,
          timestamp: this.environment.now(),
          kind: "feedback",
        });
      }
      if (added.length === 0) return;

      this.annotations = [...this.annotations, ...added];
      this.active = true;
      this.applyAccent();
      this.saveRouteState();
      this.emitAnnotations("load", added);
      this.render();
    }, this.config.demoDelay ?? 1000);
  }

  // ===========================================================================
  // Events
  // ===========================================================================

  private emit(detail: AgentationEventDetail, cancelable = false): AgentationEvent {
    const event = new this.environment.CustomEvent<AgentationEventDetail>("agentation", {
      detail,
      bubbles: true,
      composed: true,
      cancelable,
    });
    this.host.dispatchEvent(event);
    try {
      this.config.onEvent?.(event);
    } catch (cause) {
      // A throwing observer must not abort the operation that notified it, and
      // must not recurse when the notification *was* an error report.
      if (detail.type !== "error") {
        this.emitError("callback", "onEvent threw", true, cause);
      }
    }
    return event;
  }

  private emitAnnotations(
    reason: Extract<AgentationEventDetail, { type: "annotations" }>["reason"],
    affected: readonly Annotation[],
  ): void {
    this.emit({ type: "annotations", reason, current: this.annotations, affected });
  }

  private emitError(
    operation: Extract<AgentationEventDetail, { type: "error" }>["operation"],
    message: string,
    recoverable: boolean,
    cause?: unknown,
  ): void {
    this.emit({ type: "error", operation, message, recoverable, cause });
  }

  private onStorageFailure(failure: StorageFailure): void {
    this.emitError(
      "storage",
      `Could not ${failure.operation} "${failure.key}"; continuing in memory`,
      true,
      failure.cause,
    );
  }

  private flash(message: string): void {
    this.toast = message;
    this.render();
    this.freeze.scheduler.clearTimeout(this.toastTimer);
    this.toastTimer = this.freeze.scheduler.setTimeout(() => {
      this.toast = null;
      this.render();
    }, TOAST_MS);
  }

  // ===========================================================================
  // Render
  // ===========================================================================

  private get layoutState(): LayoutViewState {
    return {
      active: this.layoutActive,
      exiting: this.layoutExiting,
      wireframe: this.wireframe,
      wireframeReady: this.wireframeReady,
      wireframeOpacity: this.wireframeOpacity,
      wireframePurpose: this.wireframePurpose,
      activeComponent: this.activeComponent,
      placements: this.placements,
      rearrange: this.rearrange,
      interacting: this.layoutInteracting,
    };
  }

  private render(): void {
    if (this.destroyed) return;
    this.host.hidden = this.hidden && !this.hiding;

    const model: RuntimeViewModel = {
      active: this.active,
      hidden: this.hidden,
      hiding: this.hiding,
      entrance: this.entrance,
      theme: this.theme,
      settings: this.settings,
      toolbarPosition: this.toolbarPosition,
      // `moved`, not merely "a pointer is down": the toolbar region reads this
      // on `pointerup` to decide whether to swallow the synthesized click, so a
      // stationary press on the collapsed circle must still activate.
      dragging: this.toolbarDrag?.moved === true,
      settingsOpen: this.settingsOpen,
      settingsPage: this.settingsPage,
      tooltipsHidden: this.tooltipsHidden,
      tooltipSession: this.tooltipSession,
      annotations: this.annotations,
      exitingAnnotationIds: this.exitingAnnotationIds,
      animatedAnnotationIds: this.animatedAnnotationIds,
      renumberFrom: this.renumberFrom,
      editor: this.editor,
      markersVisible: this.markersVisible,
      markersExiting: this.markersExiting,
      hover: this.hover,
      hoveredAnnotationId: this.hoveredAnnotationId,
      outlines: this.outlines,
      dragSelection: this.dragSelection,
      dragHighlights: this.dragHighlights,
      scrolling: this.scrolling,
      frozen: this.freeze.frozen,
      layout: this.layoutState,
      hasEndpoint: Boolean(this.config.endpoint),
      connection: this.connection,
      sendState: this.sendState,
      copied: this.copied,
      metadataAdapterIds: (this.config.metadata ?? []).map((adapter) => adapter.id),
      toast: this.toast,
    };

    this.view.update(model, this.config);
  }
}

// =============================================================================
// Custom element
// =============================================================================

export function defineAgentationElement(realm?: Window): CustomElementConstructor | undefined {
  const view = realm ?? (typeof window === "undefined" ? undefined : window);
  if (!view?.customElements) return undefined;

  const existing = view.customElements.get(TAG_NAME);
  if (existing) return existing;

  // The element must extend the *realm's* `HTMLElement`, not the ambient one:
  // a document inside an iframe has its own constructor, and `customElements`
  // rejects a class whose prototype chain belongs to another realm. `Window`
  // does not declare its DOM constructors, hence the cast.
  const HTMLElementCtor = (view as unknown as { HTMLElement: typeof HTMLElement })
    .HTMLElement;

  class AgentationOverlay extends HTMLElementCtor implements AgentationElement {
    #config: AgentationConfig = {};
    #runtime: NativeAgentation | undefined;
    #failure: string | undefined;

    get config(): AgentationConfig {
      return this.#config;
    }

    set config(next: AgentationConfig) {
      this.#config = next;
      this.#runtime?.configure(next);
    }

    connectedCallback(): void {
      if (this.#runtime) return;
      const document = this.ownerDocument;
      if (instances.has(document)) {
        // Custom element reactions must not throw: the spec reports the error
        // instead of propagating it, so a throw here would surface as an
        // unhandled exception while `append()` appeared to succeed. The reason
        // is recorded for `mountAgentation` to raise at its own call site.
        this.#failure = "Only one Agentation instance per document is supported";
        console.warn(`[Agentation] ${this.#failure}`);
        return;
      }
      this.#failure = undefined;
      this.#runtime = new NativeAgentation(this, this.#config);
      instances.set(document, this.#runtime);
    }

    disconnectedCallback(): void {
      this.#runtime?.destroy();
      this.#runtime = undefined;
    }

    getRuntime(): NativeAgentation | undefined {
      return this.#runtime;
    }

    getFailure(): string | undefined {
      return this.#failure;
    }
  }

  view.customElements.define(TAG_NAME, AgentationOverlay);
  return view.customElements.get(TAG_NAME);
}

export function mountAgentation(
  document: Document,
  config: AgentationConfig = {},
): AgentationController {
  defineAgentationElement(document.defaultView ?? undefined);

  const element = document.createElement(TAG_NAME) as AgentationElement & {
    getRuntime?: () => NativeAgentation | undefined;
    getFailure?: () => string | undefined;
  };
  element.config = config;
  document.body.append(element);

  const runtime = element.getRuntime?.();
  if (!runtime) {
    element.remove();
    throw new Error(element.getFailure?.() ?? "Agentation failed to initialize");
  }

  let destroyed = false;
  return {
    element,
    configure(next: AgentationConfig): void {
      if (destroyed) throw new Error("Agentation controller has been destroyed");
      element.config = next;
    },
    getAnnotations(): readonly Annotation[] {
      return destroyed ? [] : runtime.getAnnotations();
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      element.remove();
    },
  };
}

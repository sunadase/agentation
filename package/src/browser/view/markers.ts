// =============================================================================
// Marker region
// =============================================================================
//
// Native port of `components/page-toolbar-css/annotation-marker` plus the two
// marker layers and `getTooltipPosition` of the original toolbar.
//
// One retained `<button>` per annotation id, reused across updates so that the
// CSS enter/exit/renumber animations and keyboard focus survive re-renders.
// Numbering is 1-based over the *rendered* order, so deleting a marker
// renumbers the ones after it live.
// =============================================================================

import type { Annotation } from "../../types";
import type { RuntimeEnvironment } from "../environment";
import type { AgentationConfig } from "../types";
import type { RuntimeViewModel, ViewDispatch, ViewRegion } from "./model";
import { createIcon } from "./icons";

/** Selected-text preview length inside the marker tooltip. */
const QUOTE_LIMIT = 30;

// Tooltip metrics, copied from the original `getTooltipPosition`.
const TOOLTIP_MAX_WIDTH = 200;
const TOOLTIP_ESTIMATED_HEIGHT = 80;
const TOOLTIP_GAP = 10;
const TOOLTIP_EDGE_PADDING = 10;
const MARKER_SIZE = 22;

/** Per-marker animation stagger, in both directions. */
const STAGGER_MS = 20;

// The original cleared its annotation state after `count * 30 + 200` ms, which
// is the staggered `markerOut` run plus a margin; the region owns that timer
// now because it owns the nodes that have to outlive the model.
const CLEAR_MS_PER_MARKER = 30;
const CLEAR_MS_BASE = 200;

// Glyph sizes of the original `IconXmark` / `IconEdit` usages.
const GLYPH_SIZE = 16;
const GLYPH_SIZE_MULTI = 18;
const EXIT_GLYPH_SIZE = 10;
const EXIT_GLYPH_SIZE_MULTI = 12;

type Glyph = "number" | "edit" | "close";

type Marker = {
  readonly root: HTMLButtonElement;
  readonly label: HTMLSpanElement;
  readonly editIcon: SVGSVGElement;
  readonly closeIcon: SVGSVGElement;
  readonly tooltip: HTMLSpanElement;
  readonly quote: HTMLSpanElement;
  readonly note: HTMLSpanElement;
  multi: boolean;
  // Last written values; every field is a write gate, never a source of truth.
  left: number;
  top: number;
  className: string;
  background: string;
  delay: string;
  labelText: string;
  ariaLabel: string;
  glyph: Glyph;
  glyphSize: number;
  inert: boolean;
  tooltipShown: boolean;
  tooltipTop: string;
  tooltipBottom: string;
  tooltipLeft: string;
  quoteText: string;
  noteText: string;
  // Live interaction flags read by the retained listeners.
  interactive: boolean;
  deleteMode: boolean;
};

/** Presentation of one marker for a single update. */
type MarkerState = {
  className: string;
  background: string;
  delay: string;
  labelText: string;
  ariaLabel: string;
  glyph: Glyph;
  glyphSize: number;
  inert: boolean;
  interactive: boolean;
  deleteMode: boolean;
};

function setNodeHidden(node: Element, hidden: boolean): void {
  if (hidden) {
    node.setAttribute("hidden", "");
  } else {
    node.removeAttribute("hidden");
  }
}

/** `element "quote…"`, matching the original tooltip's first line exactly. */
function quoteLine(annotation: Annotation): string {
  const selected = annotation.selectedText;
  if (!selected) {
    return annotation.element;
  }
  const ellipsis = selected.length > QUOTE_LIMIT ? "..." : "";
  return `${annotation.element} "${selected.slice(0, QUOTE_LIMIT)}${ellipsis}"`;
}

export function createMarkerRegion(
  environment: RuntimeEnvironment,
  dispatch: ViewDispatch,
): ViewRegion {
  const controller = new environment.AbortController();
  const { signal } = controller;

  const root = environment.createElement("div", "ag-marker-region");
  root.setAttribute("data-agentation-ui", "markers");
  root.hidden = true;

  // Both layers are viewport-fixed; the document-space one folds `scrollY` into
  // each marker's `top` (the runtime re-runs `update` on scroll and resize).
  const layer = environment.createElement("div", "ag-layer ag-marker-layer");
  const fixedLayer = environment.createElement(
    "div",
    "ag-layer ag-marker-layer-fixed",
  );
  root.append(layer, fixedLayer);

  const markers = new Map<string, Marker>();
  /** Nodes kept past the model purely to finish the staggered clear animation. */
  const clearing = new Set<string>();
  let clearTimer: number | undefined;
  let lastLiveIds: readonly string[] = [];

  function createMarker(annotation: Annotation): Marker {
    const multi = annotation.isMultiSelect === true;
    const node = environment.createElement("button", "ag-marker");
    node.type = "button";
    node.setAttribute("data-annotation-marker", "");
    node.setAttribute("data-agentation-ui", "marker");
    node.setAttribute("data-id", annotation.id);

    const label = environment.createElement("span", "ag-marker-label");
    const editIcon = createIcon(environment, "edit", GLYPH_SIZE);
    editIcon.classList.add("ag-marker-glyph");
    editIcon.setAttribute("hidden", "");
    const glyphSize = multi ? GLYPH_SIZE_MULTI : GLYPH_SIZE;
    const closeIcon = createIcon(environment, "xmark", glyphSize);
    closeIcon.classList.add("ag-marker-glyph");
    closeIcon.setAttribute("hidden", "");

    const tooltip = environment.createElement("span", "ag-marker-tooltip");
    // The label carries the same information for assistive technology.
    tooltip.setAttribute("aria-hidden", "true");
    tooltip.hidden = true;
    const quote = environment.createElement("span", "ag-marker-quote");
    const note = environment.createElement("span", "ag-marker-note");
    tooltip.append(quote, note);

    node.append(label, editIcon, closeIcon, tooltip);

    const marker: Marker = {
      root: node,
      label,
      editIcon,
      closeIcon,
      tooltip,
      quote,
      note,
      multi,
      left: Number.NaN,
      top: Number.NaN,
      className: "ag-marker",
      background: "",
      delay: "",
      labelText: "",
      ariaLabel: "",
      glyph: "number",
      glyphSize,
      inert: false,
      tooltipShown: false,
      tooltipTop: "",
      tooltipBottom: "",
      tooltipLeft: "",
      quoteText: "",
      noteText: "",
      interactive: false,
      deleteMode: false,
    };

    const id = annotation.id;
    node.addEventListener(
      "mouseenter",
      () => {
        if (!marker.interactive) {
          return;
        }
        dispatch({ type: "marker-hover", id });
      },
      { signal },
    );
    node.addEventListener(
      "mouseleave",
      () => dispatch({ type: "marker-hover", id: null }),
      { signal },
    );
    node.addEventListener(
      "click",
      (event) => {
        // The runtime also listens on the shadow root for page clicks.
        event.stopPropagation();
        if (!marker.interactive) {
          return;
        }
        dispatch({ type: "marker-click", id });
      },
      { signal },
    );
    node.addEventListener(
      "contextmenu",
      (event) => {
        // Right-click is the original's escape hatch for *editing* while the
        // click behaviour is set to delete; in edit mode the page keeps its
        // native context menu, so nothing is prevented there.
        if (!marker.deleteMode) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (!marker.interactive) {
          return;
        }
        dispatch({ type: "marker-context", id });
      },
      { signal },
    );

    return marker;
  }

  function ensure(annotation: Annotation): Marker {
    let marker = markers.get(annotation.id);
    if (!marker) {
      marker = createMarker(annotation);
      markers.set(annotation.id, marker);
    }
    marker.multi = annotation.isMultiSelect === true;
    // An annotation that comes back mid-clear is live again.
    clearing.delete(annotation.id);
    return marker;
  }

  function position(marker: Marker, annotation: Annotation): void {
    const left = (annotation.x / 100) * environment.innerWidth;
    const top = annotation.isFixed
      ? annotation.y
      : annotation.y - environment.scrollY;
    if (marker.left !== left) {
      marker.left = left;
      marker.root.style.left = `${left}px`;
    }
    if (marker.top !== top) {
      marker.top = top;
      marker.root.style.top = `${top}px`;
    }
  }

  function applyState(marker: Marker, state: MarkerState): void {
    marker.interactive = state.interactive;
    marker.deleteMode = state.deleteMode;

    if (marker.className !== state.className) {
      marker.className = state.className;
      marker.root.className = state.className;
    }
    if (marker.background !== state.background) {
      marker.background = state.background;
      marker.root.style.backgroundColor = state.background;
    }
    if (marker.delay !== state.delay) {
      marker.delay = state.delay;
      marker.root.style.animationDelay = state.delay;
    }
    if (marker.labelText !== state.labelText) {
      marker.labelText = state.labelText;
      marker.label.textContent = state.labelText;
    }
    if (marker.ariaLabel !== state.ariaLabel) {
      marker.ariaLabel = state.ariaLabel;
      marker.root.setAttribute("aria-label", state.ariaLabel);
    }
    if (marker.glyphSize !== state.glyphSize) {
      marker.glyphSize = state.glyphSize;
      marker.closeIcon.setAttribute("width", String(state.glyphSize));
      marker.closeIcon.setAttribute("height", String(state.glyphSize));
    }
    if (marker.glyph !== state.glyph) {
      marker.glyph = state.glyph;
      setNodeHidden(marker.label, state.glyph !== "number");
      setNodeHidden(marker.editIcon, state.glyph !== "edit");
      setNodeHidden(marker.closeIcon, state.glyph !== "close");
    }
    if (marker.inert !== state.inert) {
      marker.inert = state.inert;
      marker.root.disabled = state.inert;
      if (state.inert) {
        marker.root.setAttribute("aria-hidden", "true");
      } else {
        marker.root.removeAttribute("aria-hidden");
      }
    }
  }

  function hideTooltip(marker: Marker): void {
    if (!marker.tooltipShown) {
      return;
    }
    marker.tooltipShown = false;
    marker.tooltip.hidden = true;
  }

  /**
   * Edge-aware placement, ported from `getTooltipPosition`. The marker's
   * viewport `top` is used for the flip test so the tooltip stays inside the
   * viewport at any scroll offset.
   */
  function showTooltip(marker: Marker, annotation: Annotation): void {
    const quoteText = quoteLine(annotation);
    if (marker.quoteText !== quoteText) {
      marker.quoteText = quoteText;
      marker.quote.textContent = quoteText;
    }
    if (marker.noteText !== annotation.comment) {
      marker.noteText = annotation.comment;
      marker.note.textContent = annotation.comment;
    }

    let top = "";
    let bottom = "";
    let left = "";

    const spaceBelow =
      environment.innerHeight - marker.top - MARKER_SIZE - TOOLTIP_GAP;
    if (spaceBelow < TOOLTIP_ESTIMATED_HEIGHT) {
      top = "auto";
      bottom = `calc(100% + ${TOOLTIP_GAP}px)`;
    }

    const centerX = marker.left - TOOLTIP_MAX_WIDTH / 2;
    if (centerX < TOOLTIP_EDGE_PADDING) {
      left = `calc(50% + ${TOOLTIP_EDGE_PADDING - centerX}px)`;
    } else if (
      centerX + TOOLTIP_MAX_WIDTH >
      environment.innerWidth - TOOLTIP_EDGE_PADDING
    ) {
      const overflow =
        centerX + TOOLTIP_MAX_WIDTH - (environment.innerWidth - TOOLTIP_EDGE_PADDING);
      left = `calc(50% - ${overflow}px)`;
    }

    if (marker.tooltipTop !== top) {
      marker.tooltipTop = top;
      marker.tooltip.style.top = top;
    }
    if (marker.tooltipBottom !== bottom) {
      marker.tooltipBottom = bottom;
      marker.tooltip.style.bottom = bottom;
    }
    if (marker.tooltipLeft !== left) {
      marker.tooltipLeft = left;
      marker.tooltip.style.left = left;
    }
    if (!marker.tooltipShown) {
      marker.tooltipShown = true;
      // Un-hiding restarts the tooltip's enter animation, as remounting did.
      marker.tooltip.hidden = false;
    }
  }

  function classesFor(
    multi: boolean,
    animation: string,
    hovered: boolean,
  ): string {
    let result = "ag-marker";
    if (multi) {
      result += " ag-marker-multi";
    }
    if (animation) {
      result += ` ${animation}`;
    }
    if (hovered) {
      result += " ag-marker-hovered";
    }
    return result;
  }

  function removeMarker(id: string): void {
    const marker = markers.get(id);
    if (!marker) {
      return;
    }
    marker.root.remove();
    markers.delete(id);
  }

  /**
   * Everything drained at once (the toolbar's Clear): keep the nodes for one
   * staggered `markerOut` run instead of dropping them on the spot.
   */
  function startClear(ids: readonly string[], animate: boolean): void {
    if (!animate) {
      for (const id of ids) {
        removeMarker(id);
      }
      return;
    }

    let index = 0;
    for (const id of ids) {
      const marker = markers.get(id);
      if (!marker) {
        continue;
      }
      clearing.add(id);
      hideTooltip(marker);
      applyState(marker, {
        className: classesFor(marker.multi, "ag-marker-clearing", false),
        background: marker.background,
        delay: `${index * STAGGER_MS}ms`,
        labelText: marker.labelText,
        ariaLabel: marker.ariaLabel,
        glyph: marker.glyph,
        glyphSize: marker.glyphSize,
        inert: true,
        interactive: false,
        deleteMode: false,
      });
      index += 1;
    }

    if (clearing.size === 0) {
      return;
    }
    clearTimer = environment.timers.setTimeout(() => {
      clearTimer = undefined;
      for (const id of clearing) {
        removeMarker(id);
      }
      clearing.clear();
    }, ids.length * CLEAR_MS_PER_MARKER + CLEAR_MS_BASE);
  }

  /** Places `ordered` in `container` with the fewest possible moves. */
  function reconcile(container: HTMLElement, ordered: readonly Marker[]): void {
    let cursor = container.firstChild;
    for (const marker of ordered) {
      if (cursor === marker.root) {
        cursor = cursor.nextSibling;
        continue;
      }
      container.insertBefore(marker.root, cursor);
    }
  }

  return {
    root,

    update(
      model: Readonly<RuntimeViewModel>,
      _config: Readonly<AgentationConfig>,
    ): void {
      root.hidden = !model.markersVisible;

      const deleteMode = model.settings.markerClickBehavior === "delete";
      // The original suppressed marker affordances and tooltips while an
      // existing annotation was open in the editor.
      const editingAny = model.editor !== null && model.editor.mode === "edit";

      // `number` is the 1-based label across both layers, in rendered order.
      const liveDoc: Array<{ annotation: Annotation; number: number }> = [];
      const liveFixed: Array<{ annotation: Annotation; number: number }> = [];
      const exitingDoc: Annotation[] = [];
      const exitingFixed: Annotation[] = [];
      const liveIds: string[] = [];

      for (const annotation of model.annotations) {
        if (annotation.kind === "placement" || annotation.kind === "rearrange") {
          continue;
        }
        if (model.exitingAnnotationIds.has(annotation.id)) {
          // While the whole set exits, individual exits are not drawn at all.
          if (!model.markersExiting) {
            (annotation.isFixed ? exitingFixed : exitingDoc).push(annotation);
          }
          continue;
        }
        const entry = { annotation, number: liveIds.length + 1 };
        liveIds.push(annotation.id);
        (annotation.isFixed ? liveFixed : liveDoc).push(entry);
      }

      // A drain to zero with nothing individually exiting is a Clear. The model
      // carries no dedicated flag, so the transition is the signal.
      if (liveIds.length === 0 && lastLiveIds.length > 0 && clearing.size === 0) {
        startClear(lastLiveIds, model.markersVisible);
      }
      lastLiveIds = liveIds;

      const orderedDoc: Marker[] = [];
      const orderedFixed: Marker[] = [];
      const rendered = new Set<string>();

      const exitAll = model.markersExiting;

      function applyLive(
        entry: { annotation: Annotation; number: number },
        layerIndex: number,
        layerSize: number,
      ): Marker {
        const { annotation, number } = entry;
        const marker = ensure(annotation);
        const hovered =
          !exitAll && model.hoveredAnnotationId === annotation.id;
        const showAffordance = hovered && !editingAny;
        const showDelete = showAffordance && deleteMode;
        const animation = exitAll
          ? "ag-marker-exit"
          : model.animatedAnnotationIds.has(annotation.id)
            ? ""
            : "ag-marker-enter";
        const comment = annotation.comment;
        const verb = deleteMode ? "Delete" : "Edit";

        position(marker, annotation);
        applyState(marker, {
          className: classesFor(marker.multi, animation, showDelete),
          // `.ag-marker-hovered` owns the red delete background.
          background: showDelete
            ? ""
            : marker.multi
              ? "var(--agentation-color-green)"
              : "var(--agentation-color-accent)",
          delay: exitAll
            ? `${(layerSize - 1 - layerIndex) * STAGGER_MS}ms`
            : `${layerIndex * STAGGER_MS}ms`,
          labelText: String(number),
          ariaLabel: comment
            ? `${verb} annotation ${number}: ${comment}`
            : `${verb} annotation ${number}`,
          glyph: showAffordance ? (showDelete ? "close" : "edit") : "number",
          glyphSize: marker.multi ? GLYPH_SIZE_MULTI : GLYPH_SIZE,
          inert: false,
          interactive: !exitAll,
          deleteMode,
        });

        const renumbering =
          model.renumberFrom !== null && number - 1 >= model.renumberFrom;
        marker.label.classList.toggle("ag-marker-renumber", renumbering);

        if (hovered && !editingAny) {
          showTooltip(marker, annotation);
        } else {
          hideTooltip(marker);
        }

        rendered.add(annotation.id);
        return marker;
      }

      function applyExiting(annotation: Annotation): Marker {
        const marker = ensure(annotation);
        position(marker, annotation);
        applyState(marker, {
          className: classesFor(marker.multi, "ag-marker-exit", true),
          background: "",
          delay: "0ms",
          labelText: marker.labelText,
          ariaLabel: marker.ariaLabel,
          glyph: "close",
          glyphSize: marker.multi ? EXIT_GLYPH_SIZE_MULTI : EXIT_GLYPH_SIZE,
          inert: true,
          interactive: false,
          deleteMode,
        });
        marker.label.classList.remove("ag-marker-renumber");
        hideTooltip(marker);
        rendered.add(annotation.id);
        return marker;
      }

      for (let index = 0; index < liveDoc.length; index += 1) {
        orderedDoc.push(applyLive(liveDoc[index], index, liveDoc.length));
      }
      for (let index = 0; index < liveFixed.length; index += 1) {
        orderedFixed.push(applyLive(liveFixed[index], index, liveFixed.length));
      }
      for (const annotation of exitingDoc) {
        orderedDoc.push(applyExiting(annotation));
      }
      for (const annotation of exitingFixed) {
        orderedFixed.push(applyExiting(annotation));
      }

      for (const id of markers.keys()) {
        if (!rendered.has(id) && !clearing.has(id)) {
          removeMarker(id);
        }
      }

      reconcile(layer, orderedDoc);
      reconcile(fixedLayer, orderedFixed);
    },

    destroy(): void {
      controller.abort();
      environment.timers.clearTimeout(clearTimer);
      clearTimer = undefined;
      clearing.clear();
      for (const marker of markers.values()) {
        marker.root.remove();
      }
      markers.clear();
      lastLiveIds = [];
    },
  };
}

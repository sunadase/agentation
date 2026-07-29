// =============================================================================
// Overlay region
// =============================================================================
//
// Every non-toolbar, non-marker, non-popup visual: the hover highlight and its
// tooltip, target outlines, the drag-selection rectangle with its live element
// highlights, and the blank wireframe backdrop with its notice.
//
// The original rendered these as siblings inside a `display: contents` portal
// wrapper on `document.body`, each carrying its own absolute `z-index` (99994
// for the backdrop, 99995 for the notice, 99996/99997 for the drag and hover
// visuals, 99999 while an editor is open). The region root is `display: contents`
// for exactly that reason: a `position: fixed` root would form a stacking
// context and drag the backdrop up above the layout overlay with it.
//
// Every node is created once here and only mutated in `update()`. Hiding with
// the `hidden` attribute is deliberate: `display: none` cancels CSS animations,
// so re-showing a pooled box replays its enter animation the same way remounting
// a React element did.
// =============================================================================

import type { RuntimeEnvironment } from "../environment";
import type { AgentationConfig } from "../types";
import type { Box, Outline, RuntimeViewModel, ViewDispatch, ViewRegion } from "./model";

const NO_OUTLINES: readonly Outline[] = [];
const NO_BOXES: readonly Box[] = [];

/** Hover and outline boxes lay out with `left`/`top`: their enter animations own `transform`. */
function setOffsetBox(element: HTMLElement, box: Box): void {
  element.style.left = `${box.x}px`;
  element.style.top = `${box.y}px`;
  element.style.width = `${box.width}px`;
  element.style.height = `${box.height}px`;
}

/** Drag visuals are rewritten on every mousemove, so they translate instead of reflowing. */
function setTranslatedBox(element: HTMLElement, box: Box): void {
  element.style.transform = `translate(${box.x}px, ${box.y}px)`;
  element.style.width = `${box.width}px`;
  element.style.height = `${box.height}px`;
}

type BoxPool = {
  /** Grows once, then reuses; returns the pool so callers index into the live nodes. */
  resize(count: number): readonly HTMLDivElement[];
};

function createBoxPool(
  environment: RuntimeEnvironment,
  container: HTMLElement,
  className: string,
): BoxPool {
  const nodes: HTMLDivElement[] = [];
  return {
    resize(count: number): readonly HTMLDivElement[] {
      while (nodes.length < count) {
        const node = environment.createElement("div", className);
        node.setAttribute("aria-hidden", "true");
        nodes.push(node);
        container.append(node);
      }
      for (let index = 0; index < nodes.length; index += 1) {
        nodes[index].hidden = index >= count;
      }
      return nodes;
    },
  };
}

export function createOverlayRegion(
  environment: RuntimeEnvironment,
  dispatch: ViewDispatch,
): ViewRegion {
  const controller = new environment.AbortController();
  const { signal } = controller;

  const root = environment.createElement("div", "ag-overlay");
  root.dataset.agentationUi = "overlay";

  // --- Blank wireframe backdrop ---------------------------------------------
  const backdrop = environment.createElement("div", "ag-overlay-blank-canvas");
  backdrop.setAttribute("aria-hidden", "true");

  // --- Wireframe notice -----------------------------------------------------
  const notice = environment.createElement("div", "ag-overlay-wireframe-notice");

  const opacityRow = environment.createElement("div", "ag-overlay-wireframe-opacity-row");
  const opacityId = "ag-overlay-wireframe-opacity";
  const opacityLabel = environment.createElement(
    "label",
    "ag-overlay-wireframe-opacity-label",
  );
  opacityLabel.htmlFor = opacityId;
  opacityLabel.textContent = "Toggle Opacity";
  const opacityInput = environment.createElement(
    "input",
    "ag-overlay-wireframe-opacity-slider",
  );
  opacityInput.id = opacityId;
  opacityInput.type = "range";
  opacityInput.min = "0";
  opacityInput.max = "1";
  opacityInput.step = "0.01";
  opacityInput.value = "1";
  opacityRow.append(opacityLabel, opacityInput);

  const titleRow = environment.createElement("div", "ag-overlay-wireframe-notice-title-row");
  const title = environment.createElement("span", "ag-overlay-wireframe-notice-title");
  title.textContent = "Wireframe Mode";
  const divider = environment.createElement("span", "ag-overlay-wireframe-notice-divider");
  divider.setAttribute("aria-hidden", "true");
  const startOver = environment.createElement("button", "ag-overlay-wireframe-start-over");
  startOver.type = "button";
  startOver.textContent = "Start Over";
  titleRow.append(title, divider, startOver);

  notice.append(opacityRow, titleRow);
  // The original body is inline text with a hard break, not a wrapped block.
  notice.append(
    environment.document.createTextNode("Drag components onto the canvas."),
    environment.createElement("br"),
    environment.document.createTextNode(
      "Copied output will only include the wireframed layout.",
    ),
  );

  // --- Hover / outline / drag layer ----------------------------------------
  // One fixed layer stands in for the original `.overlay`: document order inside
  // it reproduces the original painting order (element highlights below the drag
  // rectangle, tooltip on top) without any further `z-index` declarations.
  const layer = environment.createElement("div", "ag-overlay-layer");
  layer.setAttribute("aria-hidden", "true");

  const hoverHighlight = environment.createElement("div", "ag-overlay-hover-highlight");
  const outlineGroup = environment.createElement("div", "ag-overlay-group");
  const highlightGroup = environment.createElement("div", "ag-overlay-group");
  const dragSelection = environment.createElement("div", "ag-overlay-drag-selection");

  const hoverTooltip = environment.createElement("div", "ag-overlay-hover-tooltip");
  const hoverComponentPath = environment.createElement(
    "div",
    "ag-overlay-hover-component-path",
  );
  const hoverElementName = environment.createElement("div", "ag-overlay-hover-element-name");
  hoverTooltip.append(hoverComponentPath, hoverElementName);

  layer.append(hoverHighlight, outlineGroup, highlightGroup, dragSelection, hoverTooltip);
  root.append(backdrop, notice, layer);

  const outlinePool = createBoxPool(environment, outlineGroup, "ag-overlay-outline");
  const highlightPool = createBoxPool(
    environment,
    highlightGroup,
    "ag-overlay-selected-element-highlight",
  );

  opacityInput.addEventListener(
    "input",
    () => dispatch({ type: "layout-wireframe-opacity", opacity: Number(opacityInput.value) }),
    { signal },
  );
  startOver.addEventListener("click", () => dispatch({ type: "layout-start-over" }), {
    signal,
  });

  /** Last written `--canvas-opacity`, so an unchanged model never dirties style. */
  let canvasOpacity = "";

  return {
    root,

    update(model: Readonly<RuntimeViewModel>, _config: Readonly<AgentationConfig>): void {
      // An open editor lifts the hover layer above the markers, as in the original.
      root.classList.toggle("is-editing", model.editor !== null);

      // --- Hover ------------------------------------------------------------
      const hover =
        model.active &&
        model.editor === null &&
        !model.scrolling &&
        model.dragSelection === null
          ? model.hover
          : null;
      hoverHighlight.hidden = hover === null;
      hoverTooltip.hidden = hover === null;
      if (hover) {
        setOffsetBox(hoverHighlight, hover.rect);

        const componentPath = hover.componentPath ?? "";
        hoverComponentPath.hidden = componentPath === "";
        if (hoverComponentPath.textContent !== componentPath) {
          hoverComponentPath.textContent = componentPath;
        }
        if (hoverElementName.textContent !== hover.elementName) {
          hoverElementName.textContent = hover.elementName;
        }

        // Clamped to the viewport, and lifted a whole line further when the
        // component path adds one: 48 px with a path, 32 px without.
        hoverTooltip.style.left = `${Math.max(
          8,
          Math.min(hover.pointer.x, environment.innerWidth - 100),
        )}px`;
        hoverTooltip.style.top = `${Math.max(
          hover.pointer.y - (componentPath ? 48 : 32),
          8,
        )}px`;
      }

      // --- Outlines ---------------------------------------------------------
      const outlines = model.active ? model.outlines : NO_OUTLINES;
      const outlineNodes = outlinePool.resize(outlines.length);
      // The pending target box fades out with its popup, as the original did.
      const outlinesExiting = model.editor?.exiting === true;
      for (let index = 0; index < outlines.length; index += 1) {
        const outline = outlines[index];
        const node = outlineNodes[index];
        node.classList.toggle("ag-overlay-outline-multi", outline.kind === "multi");
        node.classList.toggle("ag-overlay-outline-single", outline.kind === "single");
        node.classList.toggle("is-exiting", outlinesExiting);
        setOffsetBox(node, outline.rect);
      }

      // --- Drag selection ---------------------------------------------------
      const selection = model.active ? model.dragSelection : null;
      dragSelection.hidden = selection === null;
      if (selection) setTranslatedBox(dragSelection, selection);

      const highlights = selection ? model.dragHighlights : NO_BOXES;
      const highlightNodes = highlightPool.resize(highlights.length);
      for (let index = 0; index < highlights.length; index += 1) {
        setTranslatedBox(highlightNodes[index], highlights[index]);
      }

      // --- Wireframe backdrop & notice --------------------------------------
      const { layout } = model;
      // Stays mounted through the exit so the opacity transition can play out.
      const backdropMounted = layout.active || layout.exiting;
      backdrop.hidden = !backdropMounted;
      backdrop.classList.toggle("is-visible", backdropMounted && layout.wireframeReady);
      backdrop.classList.toggle("is-grid-active", backdropMounted && layout.interacting);

      const opacity = String(layout.wireframeOpacity);
      if (opacity !== canvasOpacity) {
        canvasOpacity = opacity;
        backdrop.style.setProperty("--canvas-opacity", opacity);
        // Writing only on change also leaves the slider alone mid-drag: the
        // echoed model value already equals what the input reports.
        if (opacityInput.value !== opacity) opacityInput.value = opacity;
      }

      notice.hidden = !(layout.active && layout.wireframe && layout.wireframeReady);
    },

    destroy(): void {
      controller.abort();
    },
  };
}

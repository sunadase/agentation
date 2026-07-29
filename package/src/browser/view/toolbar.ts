// =============================================================================
// Toolbar region
// =============================================================================
//
// The morphing shell of the original `PageFeedbackToolbarCSS`: a 44×44 collapsed
// circle with a count badge that expands into the control row. Every node is
// created once here; `update()` only flips classes, attributes, text and inline
// placement so CSS transitions, focus and the entrance animation survive.
//
// The region owns no gesture maths: `pointerdown` on the container background
// reports `drag-start` and the runtime decides whether the 10 px threshold was
// crossed, clamps to the viewport and hands back `model.toolbarPosition`.
// =============================================================================

import type { AgentationConfig } from "../types";
import type { RuntimeEnvironment } from "../environment";
import { createIcon, setIconState, type IconName } from "./icons";
import type { RuntimeViewModel, ViewDispatch, ViewRegion } from "./model";

/** Original hover delay before tooltips stop waiting for their own 850 ms. */
const TOOLTIP_SESSION_DELAY = 850;

/** Original wireframe accent, applied inline exactly as the oracle did. */
const WIREFRAME_TINT = "#f97316";
const WIREFRAME_TINT_BACKGROUND = "rgba(249, 115, 22, 0.25)";

type ToolbarControl = {
  readonly wrapper: HTMLDivElement;
  readonly button: HTMLButtonElement;
  readonly icon: SVGSVGElement;
  /**
   * Retained tooltip text node. Assigning `nodeValue` mutates it in place,
   * whereas `textContent` would swap the child out from under the animation.
   */
  readonly label: Text;
};

/** The oracle's `isValidUrl`: trimmed, http(s) only, never throws. */
function isValidUrl(
  environment: RuntimeEnvironment,
  value: string | undefined,
): boolean {
  if (!value || !value.trim()) return false;

  try {
    const url = new environment.window.URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * The badge counts what the marker layer draws: feedback annotations that are
 * not animating out. Disabled state still keys off the full set, as in the
 * original (`hasAnnotations` vs `visibleAnnotations`).
 */
function countVisibleAnnotations(model: RuntimeViewModel): number {
  let count = 0;
  for (const annotation of model.annotations) {
    if (model.exitingAnnotationIds.has(annotation.id)) continue;
    if (annotation.kind === "placement" || annotation.kind === "rearrange") {
      continue;
    }
    count += 1;
  }
  return count;
}

export function createToolbarRegion(
  environment: RuntimeEnvironment,
  dispatch: ViewDispatch,
): ViewRegion {
  const listeners = new environment.AbortController();

  // `part` lets a consumer restyle the toolbar through the shadow boundary:
  // `.my-agentation::part(toolbar) { ... }`.
  const root = environment.createElement("div", "ag-toolbar");
  root.setAttribute("data-agentation-ui", "toolbar");
  root.setAttribute("part", "toolbar");
  // The original wrapper carried both attributes; consumers and the layout
  // region target them, so they stay part of the contract.
  root.setAttribute("data-agentation-toolbar", "");
  root.setAttribute("data-feedback-toolbar", "");

  const container = environment.createElement("div", "ag-toolbar-container");

  const toggleContent = environment.createElement(
    "div",
    "ag-toolbar-toggle-content",
  );
  const toggleIcon = createIcon(environment, "list-sparkle", 24);
  const badge = environment.createElement("span", "ag-toolbar-badge");
  badge.setAttribute("aria-hidden", "true");
  const badgeText = environment.document.createTextNode("");
  badge.append(badgeText);
  toggleContent.append(toggleIcon, badge);

  const controlsContent = environment.createElement(
    "div",
    "ag-toolbar-controls-content",
  );

  const liveStatus = environment.createElement(
    "span",
    "ag-toolbar-live-status ag-visually-hidden",
  );
  liveStatus.setAttribute("aria-live", "polite");
  liveStatus.setAttribute("aria-atomic", "true");
  const liveStatusText = environment.document.createTextNode("");
  liveStatus.append(liveStatusText);

  function createControl(
    iconName: IconName,
    label: string,
    shortcut: string | undefined,
    keyshortcut: string | undefined,
    intent: () => void,
    iconSize = 24,
  ): ToolbarControl {
    const wrapper = environment.createElement(
      "div",
      "ag-toolbar-button-wrapper",
    );

    const button = environment.createElement(
      "button",
      "ag-toolbar-control-button",
    );
    button.type = "button";
    button.setAttribute("aria-label", label);
    if (keyshortcut) button.setAttribute("aria-keyshortcuts", keyshortcut);

    const icon = createIcon(environment, iconName, iconSize);
    button.append(icon);

    const tooltip = environment.createElement(
      "span",
      "ag-toolbar-button-tooltip",
    );
    // The label lives in its own span so `update()` can retarget the text
    // without disturbing the shortcut chip.
    const tooltipLabel = environment.createElement(
      "span",
      "ag-toolbar-tooltip-label",
    );
    const tooltipLabelText = environment.document.createTextNode(label);
    tooltipLabel.append(tooltipLabelText);
    tooltip.append(tooltipLabel);
    if (shortcut) {
      const chip = environment.createElement("span", "ag-toolbar-shortcut");
      chip.textContent = shortcut;
      tooltip.append(chip);
    }

    button.addEventListener(
      "click",
      (event) => {
        event.stopPropagation();
        // Original: every control hides tooltips until the pointer leaves.
        dispatch({ type: "tooltips-hidden", hidden: true });
        intent();
      },
      { signal: listeners.signal },
    );

    wrapper.append(button, tooltip);
    controlsContent.append(wrapper);
    return { wrapper, button, icon, label: tooltipLabelText };
  }

  const freeze = createControl(
    "pause-play",
    "Pause animations",
    "P",
    "p",
    () => dispatch({ type: "toggle-freeze" }),
  );

  const layout = createControl(
    "layout",
    "Layout mode",
    "L",
    "l",
    () => dispatch({ type: "toggle-layout" }),
    21,
  );

  const markers = createControl(
    "eye",
    "Show markers",
    "H",
    "h",
    () => dispatch({ type: "toggle-markers" }),
  );

  const copy = createControl("copy", "Copy feedback", "C", "c", () =>
    dispatch({ type: "copy" }),
  );

  const send = createControl("send-arrow", "Send Annotations", "S", "s", () =>
    dispatch({ type: "submit" }),
  );
  send.wrapper.classList.add("ag-toolbar-send");
  const sendBadge = environment.createElement(
    "span",
    "ag-toolbar-button-badge",
  );
  sendBadge.setAttribute("aria-hidden", "true");
  const sendBadgeText = environment.document.createTextNode("");
  sendBadge.append(sendBadgeText);
  send.button.append(sendBadge);

  const clear = createControl("trash-alt", "Clear all", "X", "x", () =>
    dispatch({ type: "clear" }),
  );
  clear.button.setAttribute("data-danger", "true");

  const settings = createControl("gear", "Settings", undefined, undefined, () =>
    dispatch({ type: "toggle-settings" }),
  );
  const indicator = environment.createElement(
    "span",
    "ag-toolbar-mcp-indicator",
  );
  indicator.setAttribute("aria-hidden", "true");
  settings.wrapper.append(indicator);

  const divider = environment.createElement("div", "ag-toolbar-divider");
  divider.setAttribute("aria-hidden", "true");
  controlsContent.append(divider);

  const exit = createControl("xmark-large", "Exit", "Esc", "Escape", () =>
    dispatch({ type: "deactivate" }),
  );

  container.append(toggleContent, controlsContent);
  root.append(container, liveStatus);

  let tooltipTimer: number | undefined;
  let suppressActivation = false;
  let dragActive = false;
  let latestModel: RuntimeViewModel | undefined;

  function clearTooltipTimer(): void {
    environment.timers.clearTimeout(tooltipTimer);
    tooltipTimer = undefined;
  }

  controlsContent.addEventListener(
    "mouseenter",
    () => {
      clearTooltipTimer();
      tooltipTimer = environment.timers.setTimeout(() => {
        tooltipTimer = undefined;
        dispatch({ type: "tooltip-session", active: true });
      }, TOOLTIP_SESSION_DELAY);
    },
    { signal: listeners.signal },
  );

  controlsContent.addEventListener(
    "mouseleave",
    () => {
      clearTooltipTimer();
      dispatch({ type: "tooltip-session", active: false });
      dispatch({ type: "tooltips-hidden", hidden: false });
    },
    { signal: listeners.signal },
  );

  container.addEventListener(
    "click",
    (event) => {
      if (latestModel?.active) return;
      // A drag that just ended must not also activate feedback mode.
      if (suppressActivation) {
        suppressActivation = false;
        event.preventDefault();
        return;
      }
      dispatch({ type: "activate" });
    },
    { signal: listeners.signal },
  );

  container.addEventListener(
    "keydown",
    (event) => {
      if (latestModel?.active) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      dispatch({ type: "activate" });
    },
    { signal: listeners.signal },
  );

  container.addEventListener(
    "pointerdown",
    (event) => {
      const target = event.target;
      if (
        !(target instanceof environment.Element) ||
        target.closest("button, [data-agentation-settings-panel]")
      ) {
        return;
      }
      dragActive = true;
      dispatch({
        type: "drag-start",
        pointerX: event.clientX,
        pointerY: event.clientY,
      });
    },
    { signal: listeners.signal },
  );

  // The pointer leaves the toolbar mid-drag, so movement and release are tracked
  // on the owning document. Pointer capture would be tidier but is missing from
  // jsdom, and the runtime's unit tests drive this region there.
  environment.document.addEventListener(
    "pointermove",
    (event) => {
      if (!dragActive) return;
      dispatch({
        type: "drag-move",
        pointerX: event.clientX,
        pointerY: event.clientY,
      });
    },
    { signal: listeners.signal },
  );

  // `pointerup` bubbles to the document before the synthesized `click`, so the
  // suppression flag is always set before the collapsed container sees a click.
  const endDrag = (): void => {
    if (!dragActive) return;
    dragActive = false;
    suppressActivation = latestModel?.dragging ?? false;
    dispatch({ type: "drag-end" });
  };

  environment.document.addEventListener("pointerup", endDrag, {
    signal: listeners.signal,
  });
  environment.document.addEventListener("pointercancel", endDrag, {
    signal: listeners.signal,
  });

  return {
    root,

    update(model: Readonly<RuntimeViewModel>, config: Readonly<AgentationConfig>) {
      latestModel = model;
      root.hidden = model.hidden;

      // A dragged position wins over the inherited placement variables; when it
      // is cleared the inline declarations go away so the variables apply again.
      const position = model.toolbarPosition;
      root.style.left = position ? `${position.x}px` : "";
      root.style.top = position ? `${position.y}px` : "";
      root.style.right = position ? "auto" : "";
      root.style.bottom = position ? "auto" : "";

      const annotationCount = model.annotations.length;
      const visibleCount = countVisibleAnnotations(model);
      const layoutContent =
        model.layout.placements.length > 0 ||
        (model.layout.rearrange?.sections.length ?? 0) > 0;
      const wireframe = model.layout.active && model.layout.wireframe;

      const copyDisabled = wireframe
        ? !layoutContent
        : annotationCount === 0 && !layoutContent;
      const clearDisabled = annotationCount === 0 && !layoutContent;

      const effectiveWebhook = model.settings.webhookUrl || config.webhookUrl;
      const sendAvailable =
        model.hasEndpoint ||
        isValidUrl(environment, effectiveWebhook) ||
        typeof config.onSubmit === "function";
      const sendResult =
        model.sendState === "sent" || model.sendState === "failed";

      // --- Shell ------------------------------------------------------------
      container.classList.toggle("is-collapsed", !model.active);
      container.classList.toggle("is-expanded", model.active);
      container.classList.toggle("is-entrance", model.entrance);
      container.classList.toggle("is-hiding", model.hiding);
      // The expanded row is 40 px wider once Send occupies its slot.
      container.classList.toggle("is-send-available", sendAvailable);

      if (model.active) {
        container.removeAttribute("role");
        container.removeAttribute("aria-label");
        container.removeAttribute("aria-expanded");
        container.removeAttribute("title");
        container.tabIndex = -1;
      } else {
        container.setAttribute("role", "button");
        container.setAttribute("aria-label", "Start feedback mode");
        container.setAttribute("aria-expanded", "false");
        container.title = "Start feedback mode";
        container.tabIndex = 0;
      }

      toggleContent.classList.toggle("is-visible", !model.active);
      toggleContent.classList.toggle("is-hidden", model.active);
      controlsContent.classList.toggle("is-visible", model.active);
      controlsContent.classList.toggle("is-hidden", !model.active);

      // --- Tooltip session / flipping --------------------------------------
      controlsContent.classList.toggle(
        "ag-toolbar-tooltip-below",
        position !== null && position.y < 100,
      );
      controlsContent.classList.toggle(
        "ag-toolbar-tooltips-hidden",
        model.tooltipsHidden || model.settingsOpen,
      );
      controlsContent.classList.toggle(
        "ag-toolbar-tooltips-in-session",
        model.tooltipSession,
      );
      freeze.wrapper.classList.toggle(
        "ag-toolbar-button-wrapper-align-left",
        position !== null && position.x < 120,
      );
      exit.wrapper.classList.toggle(
        "ag-toolbar-button-wrapper-align-right",
        position !== null && position.x > environment.innerWidth - 120,
      );

      // --- Badge ------------------------------------------------------------
      badge.hidden = visibleCount === 0;
      badgeText.nodeValue = String(visibleCount);
      badge.classList.toggle("is-fade-out", model.active);
      badge.classList.toggle("is-entrance", model.entrance);

      // --- Pause / resume ---------------------------------------------------
      const freezeLabel = model.frozen
        ? "Resume animations"
        : "Pause animations";
      freeze.button.setAttribute("aria-label", freezeLabel);
      freeze.button.setAttribute("aria-pressed", String(model.frozen));
      freeze.button.setAttribute("data-active", String(model.frozen));
      freeze.label.nodeValue = freezeLabel;
      setIconState(freeze.icon, { paused: model.frozen });

      // --- Layout mode ------------------------------------------------------
      const layoutLabel = model.layout.active ? "Exit layout mode" : "Layout mode";
      layout.button.setAttribute("aria-label", layoutLabel);
      layout.button.setAttribute("aria-pressed", String(model.layout.active));
      layout.button.setAttribute("data-active", String(model.layout.active));
      layout.label.nodeValue = layoutLabel;
      layout.button.style.color = wireframe ? WIREFRAME_TINT : "";
      layout.button.style.background = wireframe
        ? WIREFRAME_TINT_BACKGROUND
        : "";

      // --- Markers ----------------------------------------------------------
      const markersLabel = model.markersVisible ? "Hide markers" : "Show markers";
      markers.button.disabled = annotationCount === 0 || model.layout.active;
      markers.button.setAttribute("aria-label", markersLabel);
      markers.button.setAttribute("aria-pressed", String(model.markersVisible));
      markers.label.nodeValue = markersLabel;
      setIconState(markers.icon, { open: model.markersVisible });

      // --- Copy -------------------------------------------------------------
      const copyLabel = wireframe ? "Copy layout" : "Copy feedback";
      copy.button.disabled = copyDisabled;
      copy.button.setAttribute("aria-label", copyLabel);
      copy.button.setAttribute("data-active", String(model.copied));
      copy.button.classList.toggle("ag-toolbar-status-showing", model.copied);
      copy.label.nodeValue = copyLabel;
      setIconState(copy.icon, {
        copied: model.copied,
        tint: wireframe && layoutContent ? WIREFRAME_TINT : undefined,
      });

      // --- Send -------------------------------------------------------------
      send.wrapper.classList.toggle("is-send-visible", sendAvailable);
      send.button.disabled =
        !sendAvailable || annotationCount === 0 || model.sendState === "sending";
      send.button.tabIndex = sendAvailable ? 0 : -1;
      send.button.setAttribute("data-no-hover", String(sendResult));
      send.button.classList.toggle("ag-toolbar-status-showing", sendResult);
      setIconState(send.icon, { send: model.sendState });
      sendBadge.hidden = annotationCount === 0 || model.sendState !== "idle";
      sendBadgeText.nodeValue = String(annotationCount);

      // --- Clear ------------------------------------------------------------
      clear.button.disabled = clearDisabled;

      // --- Settings + MCP indicator ----------------------------------------
      settings.button.setAttribute("aria-expanded", String(model.settingsOpen));
      const indicatorVisible =
        model.hasEndpoint &&
        model.connection !== "disconnected" &&
        !model.settingsOpen;
      indicator.classList.toggle("is-visible", indicatorVisible);
      indicator.classList.toggle(
        "is-connected",
        model.connection === "connected",
      );
      indicator.classList.toggle(
        "is-connecting",
        model.connection === "connecting",
      );
      indicator.title =
        model.connection === "connected" ? "MCP Connected" : "MCP Connecting...";

      // --- Status line ------------------------------------------------------
      liveStatusText.nodeValue = statusText(model);
    },

    destroy() {
      clearTooltipTimer();
      listeners.abort();
    },
  };
}

function statusText(model: Readonly<RuntimeViewModel>): string {
  if (model.toast) return model.toast;
  if (model.copied) return "Copied";
  if (model.sendState === "sending") return "Sending";
  if (model.sendState === "sent") return "Sent";
  if (model.sendState === "failed") return "Failed";
  return "";
}

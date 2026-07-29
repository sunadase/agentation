// =============================================================================
// Native Agentation View
// =============================================================================
//
// This is deliberately only a composition root. Regions retain and update their
// own DOM; keeping the coordinator free of query selectors prevents one feature
// from accidentally rebuilding or restyling another feature's subtree.
// =============================================================================

import shadowStyles from "./styles.shadow.scss";
import type { RuntimeEnvironment } from "./environment";
import type { AgentationConfig } from "./types";
import { createLayoutRegion } from "./view/layout";
import { createMarkerRegion } from "./view/markers";
import type { RuntimeViewModel, ViewDispatch, ViewIntent, ViewRegion } from "./view/model";
import { createOverlayRegion } from "./view/overlay";
import { createPopupRegion } from "./view/popup";
import { createSettingsRegion } from "./view/settings";
import { createToolbarRegion } from "./view/toolbar";

export interface NativeAgentationView {
  update(model: Readonly<RuntimeViewModel>, config: Readonly<AgentationConfig>): void;
  focusEditor(): void;
  shakeEditor(): void;
  destroy(): void;
}

type PopupRegion = ViewRegion & {
  focusEditor(): void;
  shakeEditor(): void;
};

/**
 * Mount the framework-neutral product UI into the custom element's one shadow
 * root. The style element is intentionally created once: CSP-friendly bundled
 * CSS has no document-head side effect and never escapes this host.
 */
export function createNativeAgentationView(
  environment: RuntimeEnvironment,
  host: HTMLElement,
  dispatch: ViewDispatch,
): NativeAgentationView {
  const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  const stylesheet = environment.createElement("style");
  stylesheet.textContent = shadowStyles;
  shadowRoot.append(stylesheet);

  const toolbar = createToolbarRegion(environment, dispatch);
  const settings = createSettingsRegion(environment, dispatch);
  const popup = createPopupRegion(environment, dispatch) as PopupRegion;
  const markers = createMarkerRegion(environment, dispatch);
  const overlay = createOverlayRegion(environment, dispatch);
  const layout = createLayoutRegion(environment, dispatch);
  const regions: readonly ViewRegion[] = [overlay, markers, layout, popup, settings, toolbar];

  for (const region of regions) shadowRoot.append(region.root);

  let destroyed = false;
  let lastModel: Readonly<RuntimeViewModel> | undefined;
  let lastConfig: Readonly<AgentationConfig> | undefined;

  return {
    update(model, config) {
      if (destroyed) return;
      // Regions own their own structural diffing. They still receive a complete,
      // immutable snapshot so cross-region UI state cannot go stale.
      lastModel = model;
      lastConfig = config;
      for (const region of regions) region.update(model, config);
    },
    focusEditor() {
      if (!destroyed) popup.focusEditor();
    },
    shakeEditor() {
      if (!destroyed) popup.shakeEditor();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const region of [...regions].reverse()) region.destroy();
      stylesheet.remove();
      lastModel = undefined;
      lastConfig = undefined;
    },
  };
}

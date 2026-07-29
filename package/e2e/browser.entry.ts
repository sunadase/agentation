// Framework-free fixture: the product runtime driven through `mountAgentation`
// from `agentation/browser`. No React, no Solid. This is the page the parity
// specs treat as the shipping implementation.

import { mountAgentation } from "agentation/browser";
import type { AgentationController } from "agentation/browser";
import { renderPageBody } from "./fixtures/page-body";
import {
  harnessConfig,
  installHarness,
  readSearchConfig,
  recordMountError,
  renderControls,
  startPageTimers,
  syncControlState,
} from "./fixtures/harness";

const harness = installHarness();

renderControls(document.getElementById("controls") as HTMLElement, {
  onMount: mount,
  onUnmount: unmount,
  onReconfigure: reconfigure,
  onMountSecond: mountSecond,
});
renderPageBody(document.getElementById("page") as HTMLElement);

let controller: AgentationController | undefined;

function mount(): void {
  if (controller) return;
  try {
    controller = mountAgentation(document, harnessConfig(harness.generation));
    harness.mounted = true;
    startPageTimers();
  } catch (cause) {
    recordMountError(cause);
  }
  syncControlState();
}

function unmount(): void {
  controller?.destroy();
  controller = undefined;
  harness.mounted = false;
  syncControlState();
}

function reconfigure(): void {
  harness.generation += 1;
  try {
    controller?.configure(harnessConfig(harness.generation));
  } catch (cause) {
    recordMountError(cause);
  }
}

/**
 * A second mount into the same document must throw. The runtime enforces one
 * instance per `Document`, and the guard fires from `connectedCallback`, so the
 * failed element is left in the DOM by the browser — remove it, otherwise the
 * page keeps a dead `<agentation-overlay>` that later assertions would count.
 */
function mountSecond(): void {
  const before = document.querySelectorAll("agentation-overlay").length;
  try {
    mountAgentation(document, {});
  } catch (cause) {
    recordMountError(cause);
  }
  const overlays = document.querySelectorAll("agentation-overlay");
  for (let index = before; index < overlays.length; index += 1) {
    overlays[index].remove();
  }
}

if (readSearchConfig().autoMount) mount();

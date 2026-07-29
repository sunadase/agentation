// React lifecycle-adapter fixture: `Agentation` from the ROOT entry.
//
// The page body is rendered outside React so it is byte-identical to the other
// three fixtures; React only owns the adapter and the mount/unmount toggle.
//
// StrictMode is deliberately absent. Its development double-invocation mounts
// the adapter twice in one document, which the runtime's one-instance-per-
// document guard rejects — a real constraint, but not what these specs measure.

import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { Agentation, mountAgentation } from "agentation";
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
renderPageBody(document.getElementById("page") as HTMLElement);

type Controls = { mounted: boolean; generation: number };

let update: ((next: (previous: Controls) => Controls) => void) | undefined;

function App(): ReactElement | null {
  const [controls, setControls] = useState<Controls>({
    mounted: readSearchConfig().autoMount,
    generation: 0,
  });
  update = setControls;

  useEffect(() => {
    harness.mounted = controls.mounted;
    syncControlState();
    if (controls.mounted) startPageTimers();
  }, [controls.mounted]);

  // A key is deliberately NOT set on `generation`: reconfiguration must reach
  // the live controller through `configure`, not by remounting the adapter.
  return controls.mounted ? <Agentation {...harnessConfig(controls.generation)} /> : null;
}

renderControls(document.getElementById("controls") as HTMLElement, {
  onMount: () => update?.((previous) => ({ ...previous, mounted: true })),
  onUnmount: () => update?.((previous) => ({ ...previous, mounted: false })),
  onReconfigure: () => {
    harness.generation += 1;
    update?.((previous) => ({ ...previous, generation: previous.generation + 1 }));
  },
  // The one-instance guard is per `Document`, not per adapter, so the imperative
  // entry is the honest way to attempt a second mount from a React page: the
  // custom element throws synchronously and the error is observable here.
  onMountSecond: () => {
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
  },
});

createRoot(document.getElementById("react-root") as HTMLElement).render(<App />);

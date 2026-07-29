// Solid lifecycle-adapter fixture: `Agentation` from `agentation/solid`.
//
// Served by its own Vite config on its own port. Solid Devtools instruments
// every `.tsx` client transform, so sharing a server with the React fixtures
// would contaminate the parity oracle — hence two isolated apps.

import { createSignal, Show } from "solid-js";
import { render } from "solid-js/web";
import { Agentation, mountAgentation } from "agentation/solid";
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

const [mounted, setMounted] = createSignal(readSearchConfig().autoMount);
const [generation, setGeneration] = createSignal(0);

function setMountedState(next: boolean): void {
  setMounted(next);
  harness.mounted = next;
  syncControlState();
  if (next) startPageTimers();
}

function App() {
  // The spread expression is dynamic, so Solid re-reads it when `generation`
  // changes: the adapter must forward the new config to the live controller
  // through `configure`, never by remounting.
  return (
    <>
      {/*
        A genuinely JSX-rendered element. `#page` is built with
        `document.createElement` so it stays byte-identical across all four
        fixtures, which means nothing inside it carries `data-source-loc`. The
        Solid metadata adapter's only guarantee is source file/line/column for
        native JSX, so the spec needs a target the compiler actually stamped.
      */}
      <button id="solid-jsx-button" type="button">
        Solid JSX target
      </button>
      <Show when={mounted()}>
        <Agentation {...harnessConfig(generation())} />
      </Show>
    </>
  );
}

renderControls(document.getElementById("controls") as HTMLElement, {
  onMount: () => setMountedState(true),
  onUnmount: () => setMountedState(false),
  onReconfigure: () => {
    harness.generation += 1;
    setGeneration((value) => value + 1);
  },
  // The one-instance guard is per `Document`, so the imperative entry is the
  // honest way to attempt a second mount: it throws synchronously.
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

render(() => <App />, document.getElementById("solid-root") as HTMLElement);
// After `render`, so the page timers are registered once the runtime has
// installed its freeze wrappers.
setMountedState(mounted());

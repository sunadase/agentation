import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAnimationFreezeController,
  type AnimationFreezeController,
} from "../utils/freeze-animations";
import { createRuntimeEnvironment } from "./environment";

const live: AnimationFreezeController[] = [];

/**
 * Fake timers are installed before any controller exists, so the "native"
 * functions the freeze controller captures are themselves fake. That makes the
 * frozen and unfrozen paths both advance under `vi.advanceTimersByTime`.
 */
function controller(): AnimationFreezeController {
  const created = createAnimationFreezeController(document);
  live.push(created);
  return created;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  while (live.length) {
    const instance = live.pop();
    instance?.unfreeze();
    instance?.destroy();
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("runtime environment timers", () => {
  it("keeps Agentation's own timers running while the page is frozen", async () => {
    const freeze = controller();
    const environment = createRuntimeEnvironment(document);

    freeze.freeze();
    const pageCallback = vi.fn();
    const ownCallback = vi.fn();
    window.setTimeout(pageCallback, 0);
    environment.timers.setTimeout(ownCallback, 0);

    await vi.advanceTimersByTimeAsync(5);

    // The page is frozen, so its callback waits for the thaw.
    expect(pageCallback).not.toHaveBeenCalled();
    // Agentation's own UI must keep animating: the user drives the freeze FROM
    // that UI, so a queued popup animation or autofocus would strand them.
    expect(ownCallback).toHaveBeenCalledTimes(1);

    freeze.unfreeze();
    await vi.advanceTimersByTimeAsync(5);
    expect(pageCallback).toHaveBeenCalledTimes(1);
  });

  it("resolves unfrozen timers even when built after the freeze is installed", async () => {
    const freeze = controller();
    freeze.freeze();
    // Construction order must not matter: the legacy React bridge builds its
    // environment lazily, long after the controller patched the window.
    const environment = createRuntimeEnvironment(document);

    const ownCallback = vi.fn();
    environment.timers.setTimeout(ownCallback, 0);
    await vi.advanceTimersByTimeAsync(5);

    expect(ownCallback).toHaveBeenCalledTimes(1);
  });

  it("keeps repeating timers off the frozen path", async () => {
    const freeze = controller();
    const environment = createRuntimeEnvironment(document);
    freeze.freeze();

    const pageBeat = vi.fn();
    const ownBeat = vi.fn();
    const pageHandle = window.setInterval(pageBeat, 1);
    const ownHandle = environment.timers.setInterval(ownBeat, 1);

    await vi.advanceTimersByTimeAsync(10);
    window.clearInterval(pageHandle);
    environment.timers.clearInterval(ownHandle);

    // A frozen interval is skipped outright rather than queued: replaying a
    // backlog of ticks on thaw would fast-forward the page.
    expect(pageBeat).not.toHaveBeenCalled();
    expect(ownBeat.mock.calls.length).toBeGreaterThan(0);
  });

  it("restores the window's own timer functions when the last controller goes", () => {
    const before = window.setTimeout;
    const first = controller();
    const second = controller();

    expect(window.setTimeout).not.toBe(before);
    first.destroy();
    // One controller is still live, so the wrappers must stay installed.
    expect(window.setTimeout).not.toBe(before);

    second.destroy();
    expect(window.setTimeout).toBe(before);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

type DevtoolsOptions = { locator: Record<string, unknown> };

const { solidDevtools } = vi.hoisted(() => ({
  solidDevtools: vi.fn((_options: { locator: Record<string, unknown> }) => ({
    name: "solid-devtools",
  })),
}));

vi.mock("solid-devtools/vite", () => ({ default: solidDevtools }));

import { agentationSolidMetadata } from "./solid-vite";

beforeEach(() => {
  solidDevtools.mockClear();
});

describe("agentationSolidMetadata", () => {
  it("requests JSX source locations only", () => {
    const plugin = agentationSolidMetadata();

    expect(solidDevtools).toHaveBeenCalledTimes(1);
    expect(solidDevtools).toHaveBeenCalledWith({
      locator: { key: false, jsxLocation: true, componentLocation: false },
    });
    expect(plugin).toEqual({ name: "solid-devtools" });
  });

  it("lets callers opt out of JSX source locations", () => {
    agentationSolidMetadata({ jsxLocation: false });

    expect(solidDevtools).toHaveBeenCalledWith({
      locator: { key: false, jsxLocation: false, componentLocation: false },
    });
  });

  it("never enables the devtools keyboard locator or component locations", () => {
    agentationSolidMetadata({ jsxLocation: true });

    const { locator } = solidDevtools.mock.calls[0][0] as DevtoolsOptions;
    expect(locator.key).toBe(false);
    expect(locator.componentLocation).toBe(false);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { createRuntimeEnvironment, type RuntimeEnvironment } from "./environment";
import {
  collectArea,
  collectGroup,
  collectTarget,
  deepElementFromPoint,
  isElementFixed,
  type TargetContext,
} from "./targeting";
import type { ElementMetadataAdapter } from "./types";

function domRect(x: number, y: number, width: number, height: number): DOMRect {
  return {
    x,
    y,
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect;
}

function sized<T extends HTMLElement>(element: T, rect: DOMRect): T {
  element.getBoundingClientRect = () => rect;
  return element;
}

/** jsdom has no layout, so hit testing is supplied explicitly. */
function stubHits(...elements: Element[]): void {
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => elements[0] ?? null,
  });
  Object.defineProperty(document, "elementsFromPoint", {
    configurable: true,
    value: () => [...elements],
  });
}

function createContext(
  overrides: Partial<TargetContext> = {},
  environment: Partial<RuntimeEnvironment> = {},
): TargetContext {
  const host = document.createElement("agentation-overlay");
  document.body.append(host);
  return {
    // Spread snapshots the live getters, which is all these pure functions read.
    environment: {
      ...createRuntimeEnvironment(document),
      innerWidth: 1000,
      scrollY: 120,
      ...environment,
    } as RuntimeEnvironment,
    host,
    adapters: [],
    metadataEnabled: true,
    outputDetail: "standard",
    onMetadataError: () => {},
    ...overrides,
  };
}

afterEach(() => {
  document.body.replaceChildren();
  Reflect.deleteProperty(document, "elementFromPoint");
  Reflect.deleteProperty(document, "elementsFromPoint");
});

describe("deepElementFromPoint", () => {
  it("pierces nested open shadow roots", () => {
    const context = createContext();
    const outer = document.createElement("div");
    document.body.append(outer);
    const outerRoot = outer.attachShadow({ mode: "open" });
    const middle = document.createElement("div");
    outerRoot.append(middle);
    const middleRoot = middle.attachShadow({ mode: "open" });
    const deepest = document.createElement("span");
    middleRoot.append(deepest);

    Object.defineProperty(outerRoot, "elementFromPoint", { value: () => middle });
    Object.defineProperty(middleRoot, "elementFromPoint", { value: () => deepest });
    stubHits(outer);

    expect(deepElementFromPoint(5, 5, context)).toBe(deepest);
  });

  it("skips Agentation UI on top and returns the page element beneath it", () => {
    const context = createContext();
    const marker = document.createElement("div");
    marker.setAttribute("data-agentation-ui", "");
    context.host.append(marker);
    const pageButton = document.createElement("button");
    document.body.append(pageButton);
    stubHits(marker, context.host, pageButton);

    expect(deepElementFromPoint(5, 5, context)).toBe(pageButton);
  });

  it("returns null when only Agentation UI is under the pointer", () => {
    const context = createContext();
    stubHits(context.host);
    expect(deepElementFromPoint(5, 5, context)).toBeNull();
  });
});

describe("isElementFixed", () => {
  it("reports fixed and sticky ancestors", () => {
    const context = createContext();
    const sticky = document.createElement("div");
    sticky.style.position = "sticky";
    const child = document.createElement("p");
    sticky.append(child);
    const plain = document.createElement("p");
    document.body.append(sticky, plain);

    expect(isElementFixed(child, context)).toBe(true);
    expect(isElementFixed(plain, context)).toBe(false);
  });
});

describe("collectTarget", () => {
  it("anchors in annotation space and captures both computed style shapes", () => {
    const context = createContext();
    const button = sized(document.createElement("button"), domRect(20, 30, 120, 40));
    button.textContent = "Save profile";
    button.className = "primary";
    document.body.append(button);

    const target = collectTarget(button, 250, 50, context);

    expect(target.x).toBe(25);
    expect(target.y).toBe(170);
    expect(target.boundingBox).toEqual({ x: 20, y: 150, width: 120, height: 40 });
    expect(target.isFixed).toBe(false);
    expect(target.cssClasses).toBe("primary");
    expect(typeof target.computedStyles).toBe("string");
    expect(target.computedStylesObject).toBeTypeOf("object");
    expect(target.selectedText).toBeUndefined();
  });

  it("keeps viewport coordinates for fixed targets", () => {
    const context = createContext();
    const banner = sized(document.createElement("div"), domRect(0, 10, 200, 60));
    banner.style.position = "fixed";
    document.body.append(banner);

    const target = collectTarget(banner, 100, 40, context);

    expect(target.isFixed).toBe(true);
    expect(target.y).toBe(40);
    expect(target.boundingBox?.y).toBe(10);
  });

  it("trims the page selection to 500 characters", () => {
    const context = createContext({}, { getSelectionText: () => `  ${"a".repeat(700)}  ` });
    const paragraph = sized(document.createElement("p"), domRect(0, 0, 10, 10));
    document.body.append(paragraph);

    expect(collectTarget(paragraph, 0, 0, context).selectedText).toHaveLength(500);
  });

  it("prefixes the display name with the component path and keeps the DOM path", () => {
    const adapter: ElementMetadataAdapter = {
      id: "react",
      inspect: () => ({
        componentPath: ["App", "Profile", "Button"],
        source: { file: "src/Profile.tsx", line: 42, column: 7 },
        confidence: "exact",
      }),
    };
    const context = createContext({ adapters: [adapter] });
    const button = sized(document.createElement("button"), domRect(0, 0, 10, 10));
    button.textContent = "Save";
    document.body.append(button);

    const target = collectTarget(button, 0, 0, context);

    expect(target.element.startsWith("App Profile Button ")).toBe(true);
    expect(target.elementPath).not.toContain("App");
    expect(target.framework).toEqual({
      name: "react",
      componentPath: ["App", "Profile", "Button"],
      source: { file: "src/Profile.tsx", line: 42, column: 7 },
      confidence: "exact",
    });
    expect(target.reactComponents).toBe("App > Profile > Button");
    expect(target.sourceFile).toBe("src/Profile.tsx:42:7");
  });

  it("omits reactComponents for non-React frameworks and drops missing source parts", () => {
    const adapter: ElementMetadataAdapter = {
      id: "solid",
      inspect: () => ({ componentPath: ["App"], source: { file: "src/App.tsx", line: 9 } }),
    };
    const context = createContext({ adapters: [adapter] });
    const div = sized(document.createElement("div"), domRect(0, 0, 10, 10));
    document.body.append(div);

    const target = collectTarget(div, 0, 0, context);

    expect(target.framework?.name).toBe("solid");
    expect(target.reactComponents).toBeUndefined();
    expect(target.sourceFile).toBe("src/App.tsx:9");
  });

  it("does not copy adapter-owned arrays into the annotation", () => {
    const componentPath = ["App"];
    const adapter: ElementMetadataAdapter = {
      id: "react",
      inspect: () => ({ componentPath }),
    };
    const context = createContext({ adapters: [adapter] });
    const div = sized(document.createElement("div"), domRect(0, 0, 10, 10));
    document.body.append(div);

    expect(collectTarget(div, 0, 0, context).framework?.componentPath).not.toBe(componentPath);
  });

  it("reports a throwing adapter and falls through to the next one", () => {
    const onMetadataError = vi.fn();
    const cause = new Error("fiber walk failed");
    const context = createContext({
      adapters: [
        { id: "react", inspect: () => { throw cause; } },
        { id: "solid", inspect: () => ({ componentPath: ["Page"] }) },
      ],
      onMetadataError,
    });
    const div = sized(document.createElement("div"), domRect(0, 0, 10, 10));
    document.body.append(div);

    const target = collectTarget(div, 0, 0, context);

    expect(onMetadataError).toHaveBeenCalledWith("react", cause);
    expect(target.framework?.name).toBe("solid");
  });

  it("skips every adapter when metadata collection is disabled", () => {
    const inspect = vi.fn();
    const context = createContext({
      adapters: [{ id: "react", inspect }],
      metadataEnabled: false,
    });
    const div = sized(document.createElement("div"), domRect(0, 0, 10, 10));
    document.body.append(div);

    expect(collectTarget(div, 0, 0, context).framework).toBeUndefined();
    expect(inspect).not.toHaveBeenCalled();
  });

  it("passes the current output detail to adapters", () => {
    const inspect = vi.fn().mockReturnValue(undefined);
    const context = createContext({
      adapters: [{ id: "react", inspect }],
      outputDetail: "forensic",
    });
    const div = sized(document.createElement("div"), domRect(0, 0, 10, 10));
    document.body.append(div);

    collectTarget(div, 0, 0, context);

    expect(inspect).toHaveBeenCalledWith(div, { outputDetail: "forensic" });
  });
});

describe("collectGroup", () => {
  function group(count: number): HTMLElement[] {
    return Array.from({ length: count }, (_, index) => {
      const element = sized(
        document.createElement("p"),
        domRect(index * 10, index * 20, 30, 40),
      );
      element.textContent = `Item ${index}`;
      document.body.append(element);
      return element;
    });
  }

  it("names the first five elements and counts the rest", () => {
    const context = createContext();
    const elements = group(7);

    const target = collectGroup(elements, context);

    expect(target.element.startsWith("7 elements: ")).toBe(true);
    expect(target.element.endsWith(" +2 more")).toBe(true);
    expect(target.element.split(", ")).toHaveLength(5);
    expect(target.elementPath).toBe("multi-select");
    expect(target.isMultiSelect).toBe(true);
  });

  it("unions boxes in document space and keeps one box per element", () => {
    const context = createContext();
    const elements = group(3);

    const target = collectGroup(elements, context);

    expect(target.boundingBox).toEqual({ x: 0, y: 120, width: 50, height: 80 });
    expect(target.elementBoundingBoxes).toEqual([
      { x: 0, y: 120, width: 30, height: 40 },
      { x: 10, y: 140, width: 30, height: 40 },
      { x: 20, y: 160, width: 30, height: 40 },
    ]);
  });

  it("anchors the marker at the last element and describes the first", () => {
    const adapter: ElementMetadataAdapter = {
      id: "react",
      inspect: (element) => ({ componentPath: [element.textContent ?? ""] }),
    };
    const context = createContext({ adapters: [adapter] });
    const elements = group(2);

    const target = collectGroup(elements, context);

    // Last element: rect(10, 20, 30, 40) → center (25, 40).
    expect(target.x).toBe(2.5);
    expect(target.y).toBe(160);
    expect(target.framework?.componentPath).toEqual(["Item 0"]);
  });

  it("degrades to a plain single target for one element", () => {
    const context = createContext();
    const [only] = group(1);

    const target = collectGroup([only], context);

    expect(target.isMultiSelect).toBeUndefined();
    expect(target.elementBoundingBoxes).toBeUndefined();
    expect(target.elementPath).not.toBe("multi-select");
    expect(target.x).toBe(0);
    expect(target.y).toBe(120);
  });
});

describe("collectArea", () => {
  it("refuses click-sized regions", () => {
    const context = createContext();
    expect(collectArea(domRect(10, 12, 20, 20), context)).toBeUndefined();
    expect(collectArea(domRect(10, 12, 21, 20), context)).toBeUndefined();
  });

  it("annotates a meaningful empty region without forensic data", () => {
    const context = createContext();

    const target = collectArea(domRect(10, 12, 21, 21), context);

    expect(target?.element).toBe("Area selection");
    expect(target?.elementPath).toBe("region at (10, 12)");
    expect(target?.isMultiSelect).toBe(true);
    expect(target?.boundingBox).toEqual({ x: 10, y: 132, width: 21, height: 21 });
    expect(target?.computedStyles).toBeUndefined();
    expect(target?.fullPath).toBeUndefined();
    expect(target?.framework).toBeUndefined();
  });
});

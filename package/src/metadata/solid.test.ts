import { afterEach, describe, expect, it, vi } from "vitest";
import { createSolidMetadataAdapter } from "./solid";

const CONTEXT = { outputDetail: "standard" } as const;

afterEach(() => {
  document.body.replaceChildren();
});

function append(html: string): HTMLElement {
  const holder = document.createElement("div");
  holder.innerHTML = html;
  document.body.append(holder);
  return holder.firstElementChild as HTMLElement;
}

describe("Solid metadata adapter", () => {
  it("reads a source location directly from the annotated element", () => {
    const button = append('<button data-source-loc="/src/App.tsx:12:5">Save</button>');

    expect(createSolidMetadataAdapter().inspect(button, CONTEXT)).toEqual({
      source: { file: "/src/App.tsx", line: 12, column: 5 },
      componentPath: undefined,
      confidence: "exact",
    });
  });

  it("parses Windows drive paths without eating the drive letter", () => {
    const button = append(
      '<button data-source-loc="C:\\src\\components\\App.tsx:12:5">Save</button>',
    );

    expect(createSolidMetadataAdapter().inspect(button, CONTEXT)?.source).toEqual({
      file: "C:\\src\\components\\App.tsx",
      line: 12,
      column: 5,
    });
  });

  it("keeps a location without line/column as a bare file path", () => {
    const button = append('<button data-source-loc="C:\\src\\App.tsx">Save</button>');

    expect(createSolidMetadataAdapter().inspect(button, CONTEXT)?.source).toEqual({
      file: "C:\\src\\App.tsx",
    });
  });

  it("falls back to the nearest ancestor location with nearest confidence", () => {
    const root = append(
      '<section data-source-loc="/src/Panel.tsx:3:1"><span><em>Deep</em></span></section>',
    );
    const target = root.querySelector("em")!;

    expect(createSolidMetadataAdapter().inspect(target, CONTEXT)).toEqual({
      source: { file: "/src/Panel.tsx", line: 3, column: 1 },
      componentPath: undefined,
      confidence: "nearest",
    });
  });

  it("returns undefined when no Solid metadata is present", () => {
    const button = append("<button>Save</button>");

    expect(createSolidMetadataAdapter().inspect(button, CONTEXT)).toBeUndefined();
  });

  it("lets resolve win over attribute lookups", () => {
    const button = append('<button data-source-loc="/src/App.tsx:12:5">Save</button>');
    const resolved = {
      componentPath: ["App", "Panel"],
      source: { file: "/src/Registry.tsx", line: 1, column: 1 },
      confidence: "exact" as const,
    };

    expect(
      createSolidMetadataAdapter({ resolve: () => resolved }).inspect(button, CONTEXT),
    ).toBe(resolved);
  });

  it("falls through to attributes when resolve returns undefined", () => {
    const button = append('<button data-source-loc="/src/App.tsx:12:5">Save</button>');
    const resolve = vi.fn(() => undefined);

    expect(createSolidMetadataAdapter({ resolve }).inspect(button, CONTEXT)?.source).toEqual({
      file: "/src/App.tsx",
      line: 12,
      column: 5,
    });
    expect(resolve).toHaveBeenCalledWith(button);
  });

  it("propagates a throwing resolver so the runtime can report it", () => {
    const button = append("<button>Save</button>");
    const adapter = createSolidMetadataAdapter({
      resolve: () => {
        throw new Error("registry unavailable");
      },
    });

    expect(() => adapter.inspect(button, CONTEXT)).toThrow("registry unavailable");
  });

  it("splits the component attribute, trimming names and dropping empty segments", () => {
    const root = append(
      '<div data-components=" App >  Panel > > Button "><span>Deep</span></div>',
    );
    const target = root.querySelector("span")!;

    expect(
      createSolidMetadataAdapter({ componentAttribute: "data-components" }).inspect(
        target,
        CONTEXT,
      ),
    ).toEqual({
      source: undefined,
      componentPath: ["App", "Panel", "Button"],
      confidence: "nearest",
    });
  });

  it("defaults the component attribute to data-agentation-solid-components", () => {
    const button = append(
      '<button data-agentation-solid-components="App > Button">Save</button>',
    );

    expect(createSolidMetadataAdapter().inspect(button, CONTEXT)?.componentPath).toEqual([
      "App",
      "Button",
    ]);
  });

  it("ignores the metadata context argument", () => {
    const button = append('<button data-source-loc="/src/App.tsx:12:5">Save</button>');
    const adapter = createSolidMetadataAdapter();

    expect(adapter.inspect(button, { outputDetail: "compact" })).toEqual(
      adapter.inspect(button, { outputDetail: "forensic" }),
    );
  });
});

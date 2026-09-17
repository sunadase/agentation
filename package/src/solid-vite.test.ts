// @vitest-environment node
import { parseSync, traverse, types as t } from "@babel/core";
import { SourceMap } from "node:module";
import { transformSync } from "esbuild";
import { JSDOM } from "jsdom";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Plugin, ResolvedConfig } from "vite";
import {
  agentationSolidMetadata,
  type AgentationSolidMetadataOptions,
} from "./solid-vite";

type TransformOptions = {
  options?: AgentationSolidMetadataOptions;
  command?: "serve" | "build";
  isProduction?: boolean;
  ssrBuild?: boolean;
  ssr?: boolean;
};

async function transform(
  code: string,
  id: string,
  {
    options,
    command = "serve",
    isProduction = false,
    ssrBuild = false,
    ssr = false,
  }: TransformOptions = {},
) {
  const plugin = agentationSolidMetadata(options) as Plugin;
  if (typeof plugin.configResolved !== "function" || typeof plugin.transform !== "function") {
    throw new Error("Expected metadata configuration and transform hooks");
  }
  await plugin.configResolved({
    command,
    isProduction,
    build: { ssr: ssrBuild },
  } as ResolvedConfig);
  return plugin.transform.call({} as never, code, id, { ssr });
}

async function instrument(code: string, id: string) {
  const result = await transform(code, id);
  if (!result || typeof result === "string" || !result.map || typeof result.map === "string") {
    throw new Error("Expected transformed JSX with a source map");
  }
  return result;
}

function locations(code: string, filename: string) {
  const ast = parseSync(code, {
    filename,
    babelrc: false,
    configFile: false,
    parserOpts: {
      plugins: filename.endsWith(".tsx") ? ["jsx", "typescript"] : ["jsx"],
    },
  });
  const elements: Record<string, string | null> = {};
  traverse(ast!, {
    JSXOpeningElement({ node }) {
      const attribute = node.attributes.find(
        (attribute) =>
          t.isJSXAttribute(attribute) &&
          t.isJSXIdentifier(attribute.name, { name: "data-source-loc" }),
      );
      elements[code.slice(node.name.start!, node.name.end!)] =
        t.isJSXAttribute(attribute) && t.isStringLiteral(attribute.value)
          ? attribute.value.value
          : null;
    },
  });
  return elements;
}

function render(code: string) {
  const compiled = transformSync(code, {
    loader: "jsx",
    jsxFactory: "createElement",
    jsxFragment: "Fragment",
  });
  const view = new Function("createElement", "Fragment", `${compiled.code}\nreturn view;`)(
    createElement,
    Fragment,
  );
  const template = new JSDOM().window.document.createElement("template");
  template.innerHTML = renderToStaticMarkup(view);
  return template;
}

function position(code: string, token: string) {
  const lines = code.slice(0, code.indexOf(token)).split("\n");
  return { line: lines.length - 1, column: lines[lines.length - 1].length };
}

describe("agentationSolidMetadata", () => {
  it("stamps TSX intrinsics and custom elements with original one-based locations, not components", async () => {
    const filename = "/src/Panel.tsx";
    const source = [
      "type Props = { title: string };",
      "const props = { title: 'Hello' } satisfies Props;",
      "const view = (",
      "  <section {...props}>",
      "    <Panel><button>Save</button></Panel>",
      "    <my-control />",
      "    <UI.Item />",
      "    <ui.item />",
      "    <><svg><linearGradient /></svg></>",
      "  </section>",
      ");",
    ].join("\n");
    const result = await instrument(source, `${filename}?import`);

    expect(locations(result.code, filename)).toEqual({
      section: `${filename}:4:3`,
      Panel: null,
      button: `${filename}:5:12`,
      "my-control": `${filename}:6:5`,
      "UI.Item": null,
      "ui.item": null,
      svg: `${filename}:9:7`,
      linearGradient: `${filename}:9:12`,
    });
  });

  it("preserves rendered JSX, expressions, entities, fragments and spread precedence without runtime injection", async () => {
    const filename = "/src/View.jsx";
    const source = [
      "const marker = \"<button data-demo='text'>\";",
      "const label = `Fish & ${'chips'}`;",
      "const props = { title: 'spread', 'data-source-loc': 'app.jsx:8:9' };",
      "const view = <>",
      "  <section {...props} title='explicit'>",
      "    <span>{marker}</span>",
      "    <p>Hi {'there'} &amp; welcome</p>",
      "    <input disabled={false} defaultValue={label} />",
      "  </section>",
      "  <my-widget data-label={label} />",
      "</>;",
    ].join("\n");
    const result = await instrument(source, filename);
    const actual = render(result.code);

    expect(actual.content.querySelector("section")?.getAttribute("data-source-loc")).toBe(
      "app.jsx:8:9",
    );
    expect(actual.content.querySelector("my-widget")?.getAttribute("data-source-loc")).toBe(
      `${filename}:10:3`,
    );
    for (const element of actual.content.querySelectorAll("[data-source-loc]")) {
      if (element.getAttribute("data-source-loc")?.startsWith(`${filename}:`)) {
        element.removeAttribute("data-source-loc");
      }
    }
    expect(actual.content.isEqualNode(render(source).content)).toBe(true);
  });

  it("keeps explicit static and dynamic metadata while instrumenting neighboring elements", async () => {
    const filename = "/src/Owned.jsx";
    const source = [
      "const location = 'dynamic.jsx:7:9';",
      "const view = <section data-source-loc={location}>",
      "  <button data-source-loc='manual.jsx:3:2'>Save</button>",
      "  <span data-source-loc=''>Empty is intentional</span>",
      "  <input />",
      "</section>;",
    ].join("\n");
    const result = await instrument(source, filename);
    const actual = render(result.code).content;

    expect(actual.querySelector("section")?.getAttribute("data-source-loc")).toBe("dynamic.jsx:7:9");
    expect(actual.querySelector("button")?.getAttribute("data-source-loc")).toBe("manual.jsx:3:2");
    expect(actual.querySelector("span")?.getAttribute("data-source-loc")).toBe("");
    expect(actual.querySelector("input")?.getAttribute("data-source-loc")).toBe(`${filename}:5:3`);
  });

  it.each<[string, TransformOptions]>([
    ["builds even in development mode", { command: "build" }],
    ["production-mode development servers", { isProduction: true }],
    ["SSR configuration", { ssrBuild: true }],
    ["SSR transforms on a client development server", { ssr: true }],
    ["explicitly disabled locations", { options: { jsxLocation: false } }],
  ])("does not instrument %s", async (_label, options) => {
    expect(await transform("const view = <button />;", "/src/App.tsx", options)).toBeUndefined();
  });

  it.each([
    "/project/node_modules/library/View.tsx",
    "C:\\project\\node_modules\\library\\View.jsx",
    "/src/View.tsx?raw",
    "/src/View.jsx?import&url",
    "\0virtual:View.tsx",
    "/src/styles.css",
  ])("leaves non-source and dependency modules untouched: %s", async (id) => {
    expect(await transform("const view = <button />;", id)).toBeUndefined();
  });

  it("does not exclude application paths that merely contain the word node_modules", async () => {
    const filename = "/project/node_modules-fixture/View.jsx";
    const result = await instrument("const view = <button />;", filename);
    expect(locations(result.code, filename)).toEqual({ button: `${filename}:1:14` });
  });

  it("leaves component-only and already annotated modules unchanged", async () => {
    expect(await transform("const view = <UI.Button />;", "/src/App.jsx")).toBeUndefined();
    expect(
      await transform("const view = <button data-source-loc='owned.jsx:1:1' />;", "/src/App.jsx"),
    ).toBeUndefined();
  });

  it("maps transformed expressions back to the original source after inserting attributes", async () => {
    const filename = "/src/Mapped.tsx";
    const source = [
      "const view = (",
      "  <button onClick={() => action()}>Save</button>",
      ");",
    ].join("\n");
    const result = await instrument(source, filename);
    const generated = position(result.code, "action");
    const original = position(source, "action");
    const map = new SourceMap(result.map as ConstructorParameters<typeof SourceMap>[0]);

    expect(map.findEntry(generated.line, generated.column)).toMatchObject({
      originalSource: filename,
      originalLine: original.line,
      originalColumn: original.column,
    });
    expect(result.map.sourcesContent).toEqual([source]);
  });
});

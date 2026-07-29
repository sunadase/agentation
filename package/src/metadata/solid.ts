import type {
  ElementMetadata,
  ElementMetadataAdapter,
  ElementMetadataContext,
} from "../browser/types";

export type SolidMetadataResolver = (element: Element) => ElementMetadata | undefined;

export type SolidMetadataOptions = {
  /**
   * First-priority advanced integration: an app-owned resolver (typically an
   * owner registry populated before Solid mounts) whose result wins outright
   * over any DOM attribute lookup.
   */
  resolve?: SolidMetadataResolver;
  /** Attribute emitted by solid-devtools/vite with locator.jsxLocation enabled. */
  sourceAttribute?: string;
  /**
   * Optional app/compiler attribute containing `App > Panel > Button`. Defaults
   * to `data-agentation-solid-components`; Solid Devtools provides no stable
   * component ancestry, so the app owns this attribute.
   */
  componentAttribute?: string;
};

function parseSourceLocation(value: string | null): ElementMetadata["source"] {
  if (!value) return undefined;
  // Greedy `.*` backtracks only as far as the trailing `:line:column`, so the
  // match is right-anchored and Windows drive prefixes (`C:\src\App.tsx`) stay
  // part of the file path.
  const match = /^(.*):(\d+):(\d+)$/.exec(value);
  if (!match) return { file: value };
  return {
    file: match[1],
    line: Number(match[2]),
    column: Number(match[3]),
  };
}

export function createSolidMetadataAdapter(
  options: SolidMetadataOptions = {},
): ElementMetadataAdapter {
  const sourceAttribute = options.sourceAttribute ?? "data-source-loc";
  const componentAttribute = options.componentAttribute ?? "data-agentation-solid-components";
  return {
    id: "solid",
    inspect(element, _context?: ElementMetadataContext) {
      const resolved = options.resolve?.(element);
      if (resolved) return resolved;

      const exactSource = element.getAttribute(sourceAttribute);
      const sourceOwner = exactSource ? element : element.closest(`[${sourceAttribute}]`);
      const componentOwner = element.closest(`[${componentAttribute}]`);
      const componentValue = componentOwner?.getAttribute(componentAttribute)?.trim();
      const source = parseSourceLocation(sourceOwner?.getAttribute(sourceAttribute) ?? null);
      const componentPath = componentValue
        ? componentValue.split(">").map((name) => name.trim()).filter(Boolean)
        : undefined;
      if (!source && !componentPath?.length) return undefined;
      return {
        source,
        componentPath,
        confidence: exactSource ? "exact" : "nearest",
      };
    },
  };
}

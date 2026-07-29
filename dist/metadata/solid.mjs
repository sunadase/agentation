// src/metadata/solid.ts
function parseSourceLocation(value) {
  if (!value) return void 0;
  const match = /^(.*):(\d+):(\d+)$/.exec(value);
  if (!match) return { file: value };
  return {
    file: match[1],
    line: Number(match[2]),
    column: Number(match[3])
  };
}
function createSolidMetadataAdapter(options = {}) {
  const sourceAttribute = options.sourceAttribute ?? "data-source-loc";
  const componentAttribute = options.componentAttribute ?? "data-agentation-solid-components";
  return {
    id: "solid",
    inspect(element, _context) {
      const resolved = options.resolve?.(element);
      if (resolved) return resolved;
      const exactSource = element.getAttribute(sourceAttribute);
      const sourceOwner = exactSource ? element : element.closest(`[${sourceAttribute}]`);
      const componentOwner = element.closest(`[${componentAttribute}]`);
      const componentValue = componentOwner?.getAttribute(componentAttribute)?.trim();
      const source = parseSourceLocation(sourceOwner?.getAttribute(sourceAttribute) ?? null);
      const componentPath = componentValue ? componentValue.split(">").map((name) => name.trim()).filter(Boolean) : void 0;
      if (!source && !componentPath?.length) return void 0;
      return {
        source,
        componentPath,
        confidence: exactSource ? "exact" : "nearest"
      };
    }
  };
}
export {
  createSolidMetadataAdapter
};
//# sourceMappingURL=solid.mjs.map
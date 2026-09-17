// src/solid2.ts
import { createEffect, onSettled } from "solid-js";
import { mountAgentation } from "agentation/browser";

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

// src/solid2.ts
import { defineAgentationElement, mountAgentation as mountAgentation2 } from "agentation/browser";
function Agentation(props = {}) {
  let controller;
  let latest = {};
  let defaultMetadata;
  createEffect(
    () => {
      const { class: className, ...config } = props;
      return {
        ...config,
        className: className ?? config.className,
        metadata: config.metadata ?? (defaultMetadata ?? (defaultMetadata = [createSolidMetadataAdapter()]))
      };
    },
    (config) => {
      latest = config;
      controller?.configure(config);
    }
  );
  onSettled(() => {
    controller = mountAgentation(document, latest);
    return () => {
      controller?.destroy();
      controller = void 0;
    };
  });
  return null;
}
export {
  Agentation,
  createSolidMetadataAdapter,
  defineAgentationElement,
  mountAgentation2 as mountAgentation
};
//# sourceMappingURL=solid2.mjs.map
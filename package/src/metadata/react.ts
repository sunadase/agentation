import {
  getReactComponentName,
  type ReactDetectionMode,
  type ReactDetectionConfig,
} from "../utils/react-detection";
import { getSourceLocation } from "../utils/source-location";
import type { ElementMetadataAdapter, ElementMetadataContext } from "../browser/types";
import type { OutputDetailLevel } from "../types";

export type ReactMetadataOptions = Pick<
  ReactDetectionConfig,
  "mode" | "maxDepth" | "maxComponents"
>;

/**
 * The original toolbar derived React traversal depth from the user's output
 * detail setting; an explicit `mode` from the caller still wins.
 */
const OUTPUT_TO_REACT_MODE: Record<OutputDetailLevel, ReactDetectionMode | "off"> = {
  compact: "off",
  standard: "filtered",
  detailed: "smart",
  forensic: "all",
};

export function createReactMetadataAdapter(
  options: ReactMetadataOptions = {},
): ElementMetadataAdapter {
  const explicitMode = options.mode;
  return {
    id: "react",
    inspect(element, context?: ElementMetadataContext) {
      if (!(element instanceof HTMLElement)) return undefined;
      const mode: ReactDetectionMode | "off" | undefined =
        explicitMode ??
        (context ? OUTPUT_TO_REACT_MODE[context.outputDetail] : undefined);
      const componentNames =
        mode === "off"
          ? []
          : getReactComponentName(element, { ...options, mode }).components;
      const location = getSourceLocation(element);
      if (!componentNames.length && (!location.found || !location.source)) {
        return undefined;
      }
      return {
        componentPath: componentNames.length ? [...componentNames].reverse() : undefined,
        source: location.found && location.source
          ? {
              file: location.source.fileName,
              line: location.source.lineNumber,
              column: location.source.columnNumber,
            }
          : undefined,
        confidence: location.found ? "exact" : "heuristic",
      };
    },
  };
}

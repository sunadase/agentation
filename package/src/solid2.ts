import { createEffect, onSettled } from "solid-js";
import { mountAgentation } from "./browser/runtime";
import type {
  AgentationConfig,
  AgentationController,
  ElementMetadataAdapter,
} from "./browser/types";
import { createSolidMetadataAdapter } from "./metadata/solid";

export type AgentationProps = AgentationConfig & {
  class?: string;
};

export function Agentation(props: AgentationProps = {}): null {
  let controller: AgentationController | undefined;
  let latest: AgentationConfig = {};
  // Keep the fallback stable without allocating it for custom metadata.
  let defaultMetadata: readonly ElementMetadataAdapter[] | undefined;

  createEffect(
    () => {
      const { class: className, ...config } = props;
      return {
        ...config,
        className: className ?? config.className,
        metadata: config.metadata ?? (defaultMetadata ??= [createSolidMetadataAdapter()]),
      };
    },
    (config: AgentationConfig) => {
      latest = config;
      controller?.configure(config);
    },
  );

  // Solid 2 runs this once on the client, after effects have applied, and
  // cancels it if the owner is disposed before its first settled render.
  onSettled(() => {
    controller = mountAgentation(document, latest);
    return () => {
      controller?.destroy();
      controller = undefined;
    };
  });

  return null;
}

export { createSolidMetadataAdapter } from "./metadata/solid";
export { defineAgentationElement, mountAgentation } from "./browser/runtime";
export type {
  AgentationConfig,
  AgentationController,
  AgentationElement,
  AgentationEvent,
  AgentationEventDetail,
  ElementMetadata,
  ElementMetadataAdapter,
  ElementMetadataContext,
} from "./browser/types";
export type {
  Annotation,
  FrameworkMetadata,
  OutputDetailLevel,
  SourceLocation,
} from "./types";

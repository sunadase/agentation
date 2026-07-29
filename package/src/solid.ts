import { createEffect, onCleanup, onMount } from "solid-js";
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
  let disposed = false;
  let latest: AgentationConfig = {};
  // One default adapter per wrapper instance: reconfiguration must not churn
  // adapters, and a caller-supplied `metadata` must not allocate one at all.
  let defaultMetadata: readonly ElementMetadataAdapter[] | undefined;

  createEffect(() => {
    const { class: className, ...config } = props;
    latest = {
      ...config,
      className: className ?? config.className,
      metadata: config.metadata ?? (defaultMetadata ??= [createSolidMetadataAdapter()]),
    };
    controller?.configure(latest);
  });

  onMount(() => {
    if (disposed) return;
    controller = mountAgentation(document, latest);
  });

  onCleanup(() => {
    disposed = true;
    controller?.destroy();
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

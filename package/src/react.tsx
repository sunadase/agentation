import { useEffect, useRef } from "react";
import { mountAgentation } from "./browser/runtime";
import type {
  AgentationConfig,
  AgentationController,
  ElementMetadataAdapter,
} from "./browser/types";
import { createReactMetadataAdapter } from "./metadata/react";

export type AgentationProps = AgentationConfig;
export type DemoAnnotation = NonNullable<AgentationConfig["demoAnnotations"]>[number];

export function Agentation(props: AgentationProps = {}): null {
  const controllerRef = useRef<AgentationController>();
  const latestRef = useRef<AgentationConfig>(props);
  // One default adapter per component instance; a render must not churn it.
  const defaultMetadataRef = useRef<readonly ElementMetadataAdapter[]>();
  latestRef.current = {
    ...props,
    metadata:
      props.metadata ?? (defaultMetadataRef.current ??= [createReactMetadataAdapter()]),
  };

  useEffect(() => {
    controllerRef.current = mountAgentation(document, latestRef.current);
    return () => {
      controllerRef.current?.destroy();
      controllerRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.configure(latestRef.current);
  });

  return null;
}

export const PageFeedbackToolbarCSS = Agentation;

type SourceLocation = {
    file: string;
    line?: number;
    column?: number;
};
type FrameworkMetadata = {
    name: string;
    componentPath?: string[];
    source?: SourceLocation;
    confidence?: "exact" | "nearest" | "heuristic";
};
type OutputDetailLevel = "compact" | "standard" | "detailed" | "forensic";
type Annotation = {
    id: string;
    x: number;
    y: number;
    comment: string;
    element: string;
    elementPath: string;
    timestamp: number;
    selectedText?: string;
    boundingBox?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    nearbyText?: string;
    cssClasses?: string;
    nearbyElements?: string;
    computedStyles?: string;
    fullPath?: string;
    accessibility?: string;
    isMultiSelect?: boolean;
    isFixed?: boolean;
    framework?: FrameworkMetadata;
    reactComponents?: string;
    sourceFile?: string;
    drawingIndex?: number;
    elementBoundingBoxes?: Array<{
        x: number;
        y: number;
        width: number;
        height: number;
    }>;
    kind?: "feedback" | "placement" | "rearrange";
    placement?: {
        componentType: string;
        width: number;
        height: number;
        scrollY: number;
        text?: string;
    };
    rearrange?: {
        selector: string;
        label: string;
        tagName: string;
        originalRect: {
            x: number;
            y: number;
            width: number;
            height: number;
        };
        currentRect: {
            x: number;
            y: number;
            width: number;
            height: number;
        };
    };
    sessionId?: string;
    url?: string;
    intent?: AnnotationIntent;
    severity?: AnnotationSeverity;
    status?: AnnotationStatus;
    thread?: ThreadMessage[];
    createdAt?: string;
    updatedAt?: string;
    resolvedAt?: string;
    resolvedBy?: "human" | "agent";
    authorId?: string;
    _syncedTo?: string;
};
type AnnotationIntent = "fix" | "change" | "question" | "approve";
type AnnotationSeverity = "blocking" | "important" | "suggestion";
type AnnotationStatus = "pending" | "acknowledged" | "resolved" | "dismissed";
type ThreadMessage = {
    id: string;
    role: "human" | "agent";
    content: string;
    timestamp: number;
};

type ElementMetadata = Omit<FrameworkMetadata, "name"> & {
    framework?: string;
};
/**
 * Runtime state handed to metadata adapters so they can scale their own work
 * to the detail level the user asked for. Adapters written against the
 * original one-argument `inspect` signature remain structurally compatible.
 */
type ElementMetadataContext = Readonly<{
    outputDetail: OutputDetailLevel;
}>;
interface ElementMetadataAdapter {
    readonly id: string;
    /** Best-effort, synchronous, side-effect-free metadata lookup. */
    inspect(element: Element, context: ElementMetadataContext): ElementMetadata | undefined;
}
type DemoAnnotation$1 = {
    selector: string;
    comment: string;
    selectedText?: string;
};
type AgentationEventDetail = {
    type: "annotations";
    reason: "add" | "update" | "delete" | "clear" | "load" | "remote";
    current: readonly Annotation[];
    affected: readonly Annotation[];
} | {
    type: "copy";
    output: string;
    annotations: readonly Annotation[];
} | {
    type: "submit";
    output: string;
    annotations: readonly Annotation[];
} | {
    type: "session-created";
    sessionId: string;
} | {
    type: "error";
    operation: "callback" | "clipboard" | "configuration" | "metadata" | "storage" | "sync" | "webhook";
    message: string;
    recoverable: boolean;
    cause?: unknown;
};
type AgentationEvent = CustomEvent<AgentationEventDetail>;
type AgentationConfig = {
    demoAnnotations?: readonly DemoAnnotation$1[];
    demoDelay?: number;
    enableDemoMode?: boolean;
    onAnnotationAdd?: (annotation: Annotation) => void;
    onAnnotationDelete?: (annotation: Annotation) => void;
    onAnnotationUpdate?: (annotation: Annotation) => void;
    onAnnotationsClear?: (annotations: Annotation[]) => void;
    onCopy?: (markdown: string) => void;
    onSubmit?: (output: string, annotations: Annotation[]) => void;
    copyToClipboard?: boolean;
    endpoint?: string;
    sessionId?: string;
    onSessionCreated?: (sessionId: string) => void;
    webhookUrl?: string;
    className?: string;
    metadata?: readonly ElementMetadataAdapter[];
    onEvent?: (event: AgentationEvent) => void;
};
interface AgentationElement extends HTMLElement {
    config: AgentationConfig;
}
interface AgentationController {
    readonly element: AgentationElement;
    configure(config: AgentationConfig): void;
    getAnnotations(): readonly Annotation[];
    destroy(): void;
}
declare global {
    interface HTMLElementTagNameMap {
        "agentation-overlay": AgentationElement;
    }
    interface HTMLElementEventMap {
        agentation: AgentationEvent;
    }
}

type AgentationProps = AgentationConfig;
type DemoAnnotation = NonNullable<AgentationConfig["demoAnnotations"]>[number];
declare function Agentation(props?: AgentationProps): null;
declare const PageFeedbackToolbarCSS: typeof Agentation;

declare function defineAgentationElement(realm?: Window): CustomElementConstructor | undefined;
declare function mountAgentation(document: Document, config?: AgentationConfig): AgentationController;

type ReactDetectionMode = "all" | "filtered" | "smart";
interface ReactDetectionConfig {
    /**
     * How many component names to collect
     * @default 3
     */
    maxComponents?: number;
    /**
     * Maximum fiber depth to traverse
     * @default 25
     */
    maxDepth?: number;
    /**
     * Detection mode:
     * - 'smart': Only show components that correlate with DOM classes (strictest, most relevant)
     * - 'filtered': Skip known framework internals (default)
     * - 'all': Show all components (no filtering)
     * @default 'filtered'
     */
    mode?: ReactDetectionMode;
    /**
     * Additional exact names to skip (merged with defaults in 'filtered' mode)
     */
    skipExact?: Set<string> | string[];
    /**
     * Additional patterns to skip (merged with defaults in 'filtered' mode)
     */
    skipPatterns?: RegExp[];
    /**
     * Patterns for user components (used as fallback in 'smart' mode)
     */
    userPatterns?: RegExp[];
    /**
     * Custom filter function for full control
     * Return true to INCLUDE the component, false to skip
     */
    filter?: (name: string, depth: number) => boolean;
}

type ReactMetadataOptions = Pick<ReactDetectionConfig, "mode" | "maxDepth" | "maxComponents">;
declare function createReactMetadataAdapter(options?: ReactMetadataOptions): ElementMetadataAdapter;

/**
 * Finds the closest ancestor matching a selector, crossing shadow DOM boundaries.
 */
declare function closestCrossingShadow(element: Element, selector: string): Element | null;
/**
 * Checks if an element is inside a shadow DOM
 */
declare function isInShadowDOM(element: Element): boolean;
/**
 * Gets the shadow host for an element, or null if not in shadow DOM
 */
declare function getShadowHost(element: Element): Element | null;
/**
 * Gets a readable path for an element (e.g., "article > section > p")
 * Supports elements inside shadow DOM by crossing shadow boundaries.
 */
declare function getElementPath(target: HTMLElement, maxDepth?: number): string;
/**
 * Identifies an element and returns a human-readable name + path
 */
declare function identifyElement(target: HTMLElement): {
    name: string;
    path: string;
};
/**
 * Gets text content from element and siblings for context
 */
declare function getNearbyText(element: HTMLElement): string;
/**
 * Simplified element identifier for animation feedback (less verbose)
 */
declare function identifyAnimationElement(target: HTMLElement): string;
/**
 * Gets CSS class names from an element (cleaned of module hashes)
 */
declare function getElementClasses(target: HTMLElement): string;

declare function getStorageKey(pathname: string): string;
declare function loadAnnotations<T = Annotation>(pathname: string): T[];
declare function saveAnnotations<T = Annotation>(pathname: string, annotations: T[]): void;

export { Agentation, type AgentationConfig, type AgentationController, type AgentationElement, type AgentationEvent, type AgentationEventDetail, type AgentationProps, type Annotation, type DemoAnnotation, type ElementMetadata, type ElementMetadataAdapter, type FrameworkMetadata, type OutputDetailLevel, PageFeedbackToolbarCSS, type SourceLocation, closestCrossingShadow, createReactMetadataAdapter, defineAgentationElement, getElementClasses, getElementPath, getNearbyText, getShadowHost, getStorageKey, identifyAnimationElement, identifyElement, isInShadowDOM, loadAnnotations, mountAgentation, saveAnnotations };

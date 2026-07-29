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
type DemoAnnotation = {
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
    demoAnnotations?: readonly DemoAnnotation[];
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

type SolidMetadataResolver = (element: Element) => ElementMetadata | undefined;
type SolidMetadataOptions = {
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
declare function createSolidMetadataAdapter(options?: SolidMetadataOptions): ElementMetadataAdapter;

declare function defineAgentationElement(realm?: Window): CustomElementConstructor | undefined;
declare function mountAgentation(document: Document, config?: AgentationConfig): AgentationController;

type AgentationProps = AgentationConfig & {
    class?: string;
};
declare function Agentation(props?: AgentationProps): null;

export { Agentation, type AgentationConfig, type AgentationController, type AgentationElement, type AgentationEvent, type AgentationEventDetail, type AgentationProps, type Annotation, type ElementMetadata, type ElementMetadataAdapter, type ElementMetadataContext, type FrameworkMetadata, type OutputDetailLevel, type SourceLocation, createSolidMetadataAdapter, defineAgentationElement, mountAgentation };

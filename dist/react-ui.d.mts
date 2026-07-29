import * as react from 'react';
import * as react_jsx_runtime from 'react/jsx-runtime';

interface AnnotationPopupCSSProps {
    /** Element name to display in header */
    element: string;
    /** Optional timestamp display (e.g., "@ 1.23s" for animation feedback) */
    timestamp?: string;
    /** Optional selected/highlighted text */
    selectedText?: string;
    /** Placeholder text for the textarea */
    placeholder?: string;
    /** Initial value for textarea (for edit mode) */
    initialValue?: string;
    /** Label for submit button (default: "Add") */
    submitLabel?: string;
    /** Called when annotation is submitted with text */
    onSubmit: (text: string) => void;
    /** Called when popup is cancelled/dismissed */
    onCancel: () => void;
    /** Called when delete button is clicked (only shown if provided) */
    onDelete?: () => void;
    /** Position styles (left, top) */
    style?: React.CSSProperties;
    /** Custom color for submit button and textarea focus (hex) */
    accentColor?: string;
    /** External exit state (parent controls exit animation) */
    isExiting?: boolean;
    /** Light mode styling */
    lightMode?: boolean;
    /** Computed styles for the selected element */
    computedStyles?: Record<string, string>;
}
interface AnnotationPopupCSSHandle {
    /** Shake the popup (e.g., when user clicks outside) */
    shake: () => void;
}
declare const AnnotationPopupCSS: react.ForwardRefExoticComponent<AnnotationPopupCSSProps & react.RefAttributes<AnnotationPopupCSSHandle>>;

declare const IconClose: ({ size }: {
    size?: number;
}) => react_jsx_runtime.JSX.Element;
declare const IconPlus: ({ size }: {
    size?: number;
}) => react_jsx_runtime.JSX.Element;
declare const IconCheck: ({ size }: {
    size?: number;
}) => react_jsx_runtime.JSX.Element;
declare const IconCheckSmall: ({ size }: {
    size?: number;
}) => react_jsx_runtime.JSX.Element;
declare const IconListSparkle: ({ size, style, }: {
    size?: number;
    style?: React.CSSProperties;
}) => react_jsx_runtime.JSX.Element;
declare const IconHelp: ({ size, ...props }: {
    size?: number;
} & React.SVGProps<SVGSVGElement>) => react_jsx_runtime.JSX.Element;
declare const IconCheckSmallAnimated: ({ size }: {
    size?: number;
}) => react_jsx_runtime.JSX.Element;
declare const IconCopyAlt: ({ size }: {
    size?: number;
}) => react_jsx_runtime.JSX.Element;
declare const IconCopyAnimated: ({ size, copied, tint, }: {
    size?: number;
    copied?: boolean;
    tint?: string;
}) => react_jsx_runtime.JSX.Element;
declare const IconSendArrow: ({ size, state, }: {
    size?: number;
    state?: "idle" | "sending" | "sent" | "failed";
}) => react_jsx_runtime.JSX.Element;
declare const IconSendAnimated: ({ size, sent, }: {
    size?: number;
    sent?: boolean;
}) => react_jsx_runtime.JSX.Element;
declare const IconEye: ({ size }: {
    size?: number;
}) => react_jsx_runtime.JSX.Element;
declare const IconEyeAlt: ({ size }: {
    size?: number;
}) => react_jsx_runtime.JSX.Element;
declare const IconEyeClosed: ({ size }: {
    size?: number;
}) => react_jsx_runtime.JSX.Element;
declare const IconEyeAnimated: ({ size, isOpen, }: {
    size?: number;
    isOpen?: boolean;
}) => react_jsx_runtime.JSX.Element;
declare const IconPausePlayAnimated: ({ size, isPaused, }: {
    size?: number;
    isPaused?: boolean;
}) => react_jsx_runtime.JSX.Element;
declare const IconEyeMinus: ({ size }: {
    size?: number;
}) => react_jsx_runtime.JSX.Element;
declare const IconGear: ({ size }: {
    size?: number;
}) => react_jsx_runtime.JSX.Element;
declare const IconPauseAlt: ({ size }: {
    size?: number;
}) => react_jsx_runtime.JSX.Element;
declare const IconPause: ({ size }: {
    size?: number;
}) => react_jsx_runtime.JSX.Element;
declare const IconPlayAlt: ({ size }: {
    size?: number;
}) => react_jsx_runtime.JSX.Element;
declare const IconTrashAlt: ({ size }: {
    size?: number;
}) => react_jsx_runtime.JSX.Element;
declare const IconChatEllipsis: ({ size, style, }: {
    size?: number;
    style?: React.CSSProperties;
}) => react_jsx_runtime.JSX.Element;
declare const IconCheckmark: ({ size }: {
    size?: number;
}) => react_jsx_runtime.JSX.Element;
declare const IconCheckmarkLarge: ({ size }: {
    size?: number;
}) => react_jsx_runtime.JSX.Element;
declare const IconCheckmarkCircle: ({ size }: {
    size?: number;
}) => react_jsx_runtime.JSX.Element;
declare const IconXmark: ({ size }: {
    size?: number;
}) => react_jsx_runtime.JSX.Element;
declare const IconXmarkLarge: ({ size }: {
    size?: number;
}) => react_jsx_runtime.JSX.Element;
declare const IconSun: ({ size }: {
    size?: number;
}) => react_jsx_runtime.JSX.Element;
declare const IconMoon: ({ size }: {
    size?: number;
}) => react_jsx_runtime.JSX.Element;
declare const IconEdit: ({ size }: {
    size?: number;
}) => react_jsx_runtime.JSX.Element;
declare const IconTrash: ({ size }: {
    size?: number;
}) => react_jsx_runtime.JSX.Element;
declare const IconChevronLeft: ({ size }: {
    size?: number;
}) => react_jsx_runtime.JSX.Element;
declare const IconChevronRight: ({ size }: {
    size?: number;
}) => react_jsx_runtime.JSX.Element;
declare const AnimatedBunny: ({ size, color, }: {
    size?: number;
    color?: string;
}) => react_jsx_runtime.JSX.Element;
declare const IconLayout: ({ size }: {
    size?: number;
}) => react_jsx_runtime.JSX.Element;

export { AnimatedBunny, AnnotationPopupCSS, type AnnotationPopupCSSHandle, type AnnotationPopupCSSProps, IconChatEllipsis, IconCheck, IconCheckSmall, IconCheckSmallAnimated, IconCheckmark, IconCheckmarkCircle, IconCheckmarkLarge, IconChevronLeft, IconChevronRight, IconClose, IconCopyAlt, IconCopyAnimated, IconEdit, IconEye, IconEyeAlt, IconEyeAnimated, IconEyeClosed, IconEyeMinus, IconGear, IconHelp, IconLayout, IconListSparkle, IconMoon, IconPause, IconPauseAlt, IconPausePlayAnimated, IconPlayAlt, IconPlus, IconSendAnimated, IconSendArrow, IconSun, IconTrash, IconTrashAlt, IconXmark, IconXmarkLarge };

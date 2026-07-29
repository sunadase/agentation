import { f as ElementMetadataAdapter } from '../types-C4WpFlyO.js';

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

export { type ReactMetadataOptions, createReactMetadataAdapter };

import { E as ElementMetadata, f as ElementMetadataAdapter } from '../types-C4WpFlyO.js';

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

export { type SolidMetadataOptions, type SolidMetadataResolver, createSolidMetadataAdapter };

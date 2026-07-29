# agentation — `pkg` branch (fork build)

**This branch is a generated build artifact, not source.** Its root is the
built package, so it installs as a plain git dependency with any package
manager. Do not edit files here by hand — they are overwritten on every
regeneration. Source of truth is
[`feat/framework-agnostic-custom-element`](https://github.com/sunadase/agentation/tree/feat/framework-agnostic-custom-element).

Fork of [`benjitaylor/agentation`](https://github.com/benjitaylor/agentation),
built to add SolidJS support. It carries only what a real npm publish would
ship (`package.json`, `dist/`, `README.md`, `LICENSE`), because the package
declares `files: ["dist"]`.

## Install

```json
{
  "dependencies": {
    "agentation": "github:sunadase/agentation#pkg"
  }
}
```

No subdirectory syntax is needed, so npm, pnpm, yarn and bun all work.

`#pkg` is a moving branch. Your lockfile pins the resolved commit, which is
normally enough; to be explicit, depend on `#<sha>` instead.

## Use

React (unchanged from upstream):

```tsx
import { Agentation } from 'agentation';
```

SolidJS — the reason this fork exists:

```tsx
import { Agentation } from 'agentation/solid';
```

Optionally add source file/line/column to annotations. The plugin is a no-op
outside the development client, so production builds fall back to DOM and
accessibility data:

```ts
// vite.config.ts / app.config.ts
import agentationSolidMetadata from 'agentation/solid/vite';

export default defineConfig({
  plugins: [agentationSolidMetadata(), solid()],
});
```

Any other framework, or no framework:

```ts
import { mountAgentation } from 'agentation/browser';

const agentation = mountAgentation(document);
// agentation.destroy() on HMR or teardown
```

Available subpaths: `.`, `./browser`, `./solid`, `./solid/vite`,
`./metadata/react`, `./metadata/solid`, `./react/ui`.

## Version caveat

`package.json` reports the upstream version number. This build is the
framework-agnostic 4.0 runtime and contains a **breaking change** relative to
that number: `AnnotationPopupCSS` and the icon set moved from `agentation` to
`agentation/react/ui`. `Agentation` and the `PageFeedbackToolbarCSS` alias are
unchanged.

## Regenerating

After changing the source branch:

```bash
cd package && pnpm build
T=$(mktemp -d)
cat FORK-README.md > "$T/README.md"
printf '\n---\n\n' >> "$T/README.md"
cat README.md >> "$T/README.md"
cp package.json LICENSE "$T"/
cp -r dist "$T"/dist
cd "$T" && git init -q -b pkg && git add -A && git commit -qm "agentation build" \
  && git remote add fork https://github.com/sunadase/agentation.git \
  && git push -f fork pkg
```

## License

`PolyForm-Shield-1.0.0`, inherited from upstream. Source-available, not open
source: it permits use except to build a product competing with the licensor's.
Review it before distributing this build beyond your own team.

---

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/benjitaylor/agentation/main/package/logo-dark.svg">
  <img src="https://raw.githubusercontent.com/benjitaylor/agentation/main/package/logo.svg" alt="Agentation" width="200">
</picture>

<br>

[![npm version](https://img.shields.io/npm/v/agentation)](https://www.npmjs.com/package/agentation)
[![downloads](https://img.shields.io/npm/dm/agentation)](https://www.npmjs.com/package/agentation)

**[Agentation](https://agentation.com)** is an agent-agnostic visual feedback tool. Click elements on your page, add notes, and copy structured output that helps AI coding agents find the exact code you're referring to.

## Install

```bash
npm install agentation -D
```

## React

```tsx
import { Agentation } from 'agentation';

function App() {
  return (
    <>
      <YourApp />
      <Agentation />
    </>
  );
}
```

The toolbar appears in the bottom-right corner. Click to activate, then click any element to annotate it.

## SolidJS / SolidStart

```bash
npm install agentation solid-devtools -D
```

Add development-only source instrumentation before Solid's compiler:

```ts
// app.config.ts or vite.config.ts
import agentationSolidMetadata from 'agentation/solid/vite';

export default defineConfig({
  vite: {
    plugins: [agentationSolidMetadata()],
  },
});
```

Load the lifecycle wrapper on the client and behind the development flag:

```tsx
import { clientOnly } from '@solidjs/start';

const DevAgentation = import.meta.env.DEV
  ? clientOnly(() =>
      import('agentation/solid').then(({ Agentation }) => ({
        default: Agentation,
      })),
    )
  : () => null;

export default function App() {
  return (
    <>
      <YourApp />
      <DevAgentation />
    </>
  );
}
```

Source instrumentation is optional. Without it, annotations still include DOM
selectors, accessibility data, styles, text context, and geometry.

## Browser and custom element

Other frameworks can mount the same custom-element runtime:

```ts
import { mountAgentation } from 'agentation/browser';

const agentation = mountAgentation(document, {
  onEvent(event) {
    if (event.detail.type === 'copy') {
      console.log(event.detail.output);
    }
  },
});

// HMR or framework cleanup
agentation.destroy();
```

For declarative usage, define the element and append `<agentation-overlay>`:

```ts
import { defineAgentationElement } from 'agentation/browser';

defineAgentationElement(window);
document.body.append(document.createElement('agentation-overlay'));
```

## React UI helpers

The toolbar itself is a framework-neutral custom element, so the React-only
presentational pieces live on their own subpath and pull in no runtime:

```tsx
import { AnnotationPopupCSS, IconCheck } from 'agentation/react/ui';
```

`AnnotationPopupCSS`, its types, and the icon set moved here in 4.0. They used
to be re-exported from the root; importing them from `agentation` no longer
works. `Agentation` itself is unchanged.

## Features

- **Click to annotate** – Click any element with automatic selector identification
- **Text selection** – Select text to annotate specific content
- **Multi-select** – Drag to select multiple elements at once
- **Area selection** – Drag to annotate any region, even empty space
- **Animation pause** – Freeze all animations (CSS, JS, videos) to capture specific states
- **Structured output** – Copy markdown with selectors, positions, and context
- **Programmatic access** – Callback prop for direct integration with tools
- **Dark/light mode** – Toggle in settings, persists to localStorage
- **Framework-neutral runtime** – One custom element shared by React, Solid, and browser callers

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onAnnotationAdd` | `(annotation: Annotation) => void` | - | Called when an annotation is created |
| `onAnnotationDelete` | `(annotation: Annotation) => void` | - | Called when an annotation is deleted |
| `onAnnotationUpdate` | `(annotation: Annotation) => void` | - | Called when an annotation is edited |
| `onAnnotationsClear` | `(annotations: Annotation[]) => void` | - | Called when all annotations are cleared |
| `onCopy` | `(markdown: string) => void` | - | Callback with markdown output when copy is clicked |
| `onSubmit` | `(output: string, annotations: Annotation[]) => void` | - | Called when "Send Annotations" is clicked |
| `copyToClipboard` | `boolean` | `true` | Set to false to prevent writing to clipboard |
| `endpoint` | `string` | - | Server URL for Agent Sync (e.g., `"http://localhost:4747"`) |
| `sessionId` | `string` | - | Pre-existing session ID to join |
| `onSessionCreated` | `(sessionId: string) => void` | - | Called when a new session is created |
| `webhookUrl` | `string` | - | Webhook URL to receive annotation events |

### Programmatic Integration

Use callbacks to receive annotation data directly:

```tsx
import { Agentation, type Annotation } from 'agentation';

function App() {
  const handleAnnotation = (annotation: Annotation) => {
    // Structured data - no parsing needed
    console.log(annotation.element);      // "Button"
    console.log(annotation.elementPath);  // "body > div > button"
    console.log(annotation.boundingBox);  // { x, y, width, height }
    console.log(annotation.cssClasses);   // "btn btn-primary"

    // Send to your agent, API, etc.
    sendToAgent(annotation);
  };

  return (
    <>
      <YourApp />
      <Agentation
        onAnnotationAdd={handleAnnotation}
        copyToClipboard={false}  // Don't write to clipboard
      />
    </>
  );
}
```

### Annotation Type

```typescript
type Annotation = {
  id: string;
  x: number;                    // % of viewport width
  y: number;                    // px from top of document (absolute) OR viewport (if isFixed)
  comment: string;              // User's note
  element: string;              // e.g., "Button"
  elementPath: string;          // e.g., "body > div > button"
  timestamp: number;

  // Optional metadata (when available)
  selectedText?: string;
  boundingBox?: { x: number; y: number; width: number; height: number };
  nearbyText?: string;
  cssClasses?: string;
  nearbyElements?: string;
  computedStyles?: string;
  fullPath?: string;
  accessibility?: string;
  isMultiSelect?: boolean;
  isFixed?: boolean;
  framework?: {
    name: string;
    componentPath?: string[];
    source?: { file: string; line?: number; column?: number };
    confidence?: "exact" | "nearest" | "heuristic";
  };
};
```

> **Note:** This is a simplified type. The full type includes additional fields for Agent Sync (`url`, `status`, `thread`, `reactComponents`, etc.). See [agentation.com/schema](https://agentation.com/schema) for the complete schema.

## How it works

Agentation captures class names, selectors, and element positions so AI agents can `grep` for the exact code you're referring to. Instead of describing "the blue button in the sidebar," you give the agent `.sidebar > button.primary` and your feedback.

## Requirements

- A desktop browser (mobile is not supported)
- React 18+ only when using the root React wrapper
- SolidJS 1.9+ only when using `agentation/solid`

## Docs

Full documentation at [agentation.com](https://agentation.com)

## License

© 2026 Benji Taylor

Licensed under PolyForm Shield 1.0.0

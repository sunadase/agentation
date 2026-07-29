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

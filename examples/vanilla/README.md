# @polyrender/example-vanilla

Vanilla TypeScript example for [`@polyrender/core`](../../packages/core/README.md), built with esbuild.

A hosted version of this example is available at **https://polyrender.wisp.place/**.

## Running locally

```bash
# From the monorepo root, build all packages first:
pnpm build

# Then serve the example:
cd examples/vanilla
pnpm serve
```

Or use watch mode during development:

```bash
pnpm dev
```

## What it shows

- Opening a local file via a file input (PDF, EPUB, DOCX, CSV, code, comic archives, and more)
- Auto-detecting the document format from the filename
- Rendering with the built-in dark-themed toolbar
- Comic book archives (`.cbz`, `.cbr`, `.cb7`, `.cbt`) with JPEG XL and TIFF support enabled via `@jsquash/jxl` and `utif`
- Word wrap / fit-to-width toolbar toggle (active for code, text, and comic files)

# @polyrender/example-basic

Vite + vanilla TypeScript example for [`@polyrender/core`](../../packages/core/README.md). Demonstrates file-picker based document viewing with the built-in toolbar.

A live demo is coming soon.

## Running locally

```bash
# From the monorepo root, build all packages first:
pnpm build

# Then start the Vite dev server:
cd examples/basic
pnpm dev
```

To build for production:

```bash
pnpm build
pnpm preview
```

## What it shows

- Opening a local file via a file input
- Auto-detecting the document format from the filename
- Rendering with the built-in dark-themed toolbar
- Configuring the `pdfjs-dist` worker URL via Vite's `?url` import
- Comic book archives (`.cbz`, `.cbr`, `.cb7`, `.cbt`) with JPEG XL and TIFF support enabled via `@jsquash/jxl` and `utif`
- Word wrap / fit-to-width toolbar toggle (active for code, text, and comic files)

# PolyRender

A framework-agnostic, universal document renderer for the browser. Render PDFs, EPUBs, DOCX files, CSVs, source code, and plain text — with optional support for pre-rendered page images and chunked streaming for large documents.

**Core** (`@polyrender/core`) is a vanilla TypeScript library with zero framework dependencies. **React** (`@polyrender/react`) provides a thin wrapper component and hook. Both are designed for drop-in use in any web project.

## Features

- **Multi-format rendering** — PDF, EPUB, DOCX, CSV/TSV, source code (100+ languages), plain text
- **Chunked loading** — Stream large documents via pre-rendered page images or split PDF chunks
- **Fetch adapters** — Pass data directly or provide a lazy-loading callback for on-demand fetching
- **CSS variable theming** — Dark and light themes built in, fully customizable via `--dv-*` variables
- **Framework-agnostic** — Use vanilla JS, React, or build your own wrapper
- **Lazy peer dependencies** — Only loads renderer libraries (pdfjs, epubjs, etc.) when that format is actually used
- **Custom renderers** — Register your own renderer for any format via the plugin registry
- **TypeScript-first** — Complete type definitions for all APIs

## Installation

```bash
# Core (vanilla JS)
npm install @polyrender/core

# React wrapper
npm install @polyrender/react

# Install peer dependencies for the formats you need:
npm install pdfjs-dist       # PDF
npm install epubjs           # EPUB
npm install docx-preview     # DOCX
npm install papaparse        # CSV/TSV
npm install highlight.js     # Code syntax highlighting
npm install jszip            # ODT
npm install xlsx             # ODS
```

You only need to install peer dependencies for the formats you plan to render. Unused formats won't add to your bundle.

## Quick Start

### Vanilla JS

```typescript
import { PolyRender } from '@polyrender/core'
import '@polyrender/core/styles.css'

const viewer = new PolyRender(document.getElementById('viewer')!, {
  source: { type: 'url', url: '/document.pdf' },
  theme: 'dark',
  toolbar: true,
  onReady: (info) => {
    console.log(`Loaded: ${info.pageCount} pages`)
  },
  onPageChange: (page, total) => {
    console.log(`Page ${page} of ${total}`)
  },
})

// Imperative control
viewer.goToPage(5)
viewer.setZoom('fit-width')

// Clean up
viewer.destroy()
```

### React

```tsx
import { DocumentViewer } from '@polyrender/react'
import '@polyrender/core/styles.css'

function App() {
  return (
    <DocumentViewer
      source={{ type: 'url', url: '/report.pdf' }}
      theme="dark"
      style={{ width: '100%', height: '80vh' }}
      onReady={(info) => console.log(`${info.pageCount} pages`)}
      onPageChange={(page, total) => console.log(`${page}/${total}`)}
    />
  )
}
```

### React with Ref

```tsx
import { useRef } from 'react'
import { DocumentViewer, type DocumentViewerRef } from '@polyrender/react'
import '@polyrender/core/styles.css'

function App() {
  const viewerRef = useRef<DocumentViewerRef>(null)

  return (
    <>
      <DocumentViewer
        ref={viewerRef}
        source={{ type: 'url', url: '/report.pdf' }}
        style={{ width: '100%', height: '80vh' }}
      />
      <button onClick={() => viewerRef.current?.goToPage(1)}>
        Go to first page
      </button>
    </>
  )
}
```

### React Hook (headless)

```tsx
import { useDocumentRenderer } from '@polyrender/react'
import '@polyrender/core/styles.css'

function CustomViewer({ url }: { url: string }) {
  const { containerRef, state, goToPage, setZoom } = useDocumentRenderer({
    source: { type: 'url', url },
    theme: 'dark',
    toolbar: false, // Hide built-in toolbar, build your own
  })

  return (
    <div>
      <div ref={containerRef} style={{ width: '100%', height: '600px' }} />
      <div>
        <button onClick={() => goToPage(state.currentPage - 1)}>Prev</button>
        <span>{state.currentPage} / {state.totalPages}</span>
        <button onClick={() => goToPage(state.currentPage + 1)}>Next</button>
        <button onClick={() => setZoom(state.zoom * 1.2)}>Zoom In</button>
      </div>
    </div>
  )
}
```

## Document Sources

PolyRender accepts four types of document sources:

### File (binary data)

```typescript
// From a File input
const file = inputElement.files[0]
source = { type: 'file', data: file, filename: file.name }

// From an ArrayBuffer
source = { type: 'file', data: arrayBuffer, mimeType: 'application/pdf' }

// From a Uint8Array
source = { type: 'file', data: uint8Array, filename: 'doc.pdf' }
```

### URL

```typescript
source = { type: 'url', url: 'https://example.com/doc.pdf' }

// With custom headers (e.g., auth)
source = {
  type: 'url',
  url: '/api/documents/123.pdf',
  fetchOptions: { headers: { Authorization: 'Bearer ...' } },
}
```

### Pre-rendered Pages (for browsing without the original document)

```typescript
// Direct data
source = {
  type: 'pages',
  pages: [
    { pageNumber: 1, imageUrl: '/pages/1.webp', width: 1654, height: 2339 },
    { pageNumber: 2, imageUrl: '/pages/2.webp', width: 1654, height: 2339 },
  ],
}

// Lazy fetch adapter (loads pages on demand as user scrolls)
source = {
  type: 'pages',
  pages: {
    totalPages: 500,
    fetchPage: async (pageNumber) => ({
      pageNumber,
      imageUrl: `/api/pages/${pageNumber}.webp`,
      width: 1654,
      height: 2339,
    }),
  },
}
```

### Chunked PDF (streaming large documents)

```typescript
source = {
  type: 'chunked',
  totalPages: 500,
  // PDF chunks for full-fidelity rendering
  chunks: {
    totalChunks: 10,
    totalPages: 500,
    fetchChunk: async (index) => {
      const res = await fetch(`/api/chunks/${index}.pdf`)
      return {
        data: await res.arrayBuffer(),
        pageStart: index * 50 + 1,
        pageEnd: Math.min((index + 1) * 50, 500),
      }
    },
    getChunkIndexForPage: (page) => Math.floor((page - 1) / 50),
  },
  // Optional: fast browse images while chunks load
  browsePages: {
    totalPages: 500,
    fetchPage: async (pageNumber) => ({
      pageNumber,
      imageUrl: `/api/browse/${pageNumber}.webp`,
      width: 1654,
      height: 2339,
    }),
  },
}
```

## Theming

PolyRender uses CSS custom properties for all visual styling. Override any `--dv-*` variable to customize:

```css
/* Custom theme */
.my-viewer .polyrender {
  --dv-bg: #1e1e2e;
  --dv-surface: #2a2a3e;
  --dv-text: #cdd6f4;
  --dv-accent: #89b4fa;
  --dv-border: #45475a;
  --dv-page-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
  --dv-font-sans: 'JetBrains Mono', monospace;
}
```

Built-in themes: `dark` (default) and `light`. Set via the `theme` prop/option, or `'system'` to auto-detect from `prefers-color-scheme`.

### Key CSS Variables

| Variable | Description |
|----------|-------------|
| `--dv-bg` | Background color |
| `--dv-surface` | Toolbar and panel backgrounds |
| `--dv-text` | Primary text color |
| `--dv-text-secondary` | Secondary/muted text |
| `--dv-accent` | Accent color (links, focus rings) |
| `--dv-border` | Border color |
| `--dv-page-bg` | Document page background |
| `--dv-page-shadow` | Document page drop shadow |
| `--dv-font-sans` | Sans-serif font stack |
| `--dv-font-mono` | Monospace font stack |
| `--dv-radius` | Border radius |
| `--dv-toolbar-height` | Toolbar height |

See `styles.css` for the complete list.

## Format-Specific Options

### PDF

```typescript
{
  pdf: {
    workerSrc: '/pdf.worker.min.js', // pdf.js worker URL
    cMapUrl: '/cmaps/',               // Character map directory
    textLayer: true,                   // Enable text selection (default true)
    annotationLayer: false,            // Show PDF annotations
  }
}
```

### Code

```typescript
{
  code: {
    language: 'typescript', // Force language (auto-detected from extension)
    lineNumbers: true,      // Show line numbers (default true)
    wordWrap: false,        // Enable word wrapping (default false)
    tabSize: 2,             // Tab width in spaces (default 2)
  }
}
```

### CSV

```typescript
{
  csv: {
    delimiter: ',',    // Field delimiter (auto-detected)
    header: true,      // First row is header (default true)
    maxRows: 10000,    // Max rows to render (default 10000)
    sortable: true,    // Enable column sorting (default true)
  }
}
```

### EPUB

```typescript
{
  epub: {
    flow: 'paginated', // 'paginated' or 'scrolled' (default 'paginated')
    fontSize: 16,       // Font size in pixels (default 16)
    fontFamily: 'Georgia', // Font override
  }
}
```

### ODT

```typescript
{
  odt: {
    fontSize: 16,          // Base font size in pixels (default 16)
    fontFamily: 'Georgia', // Font override
  }
}
```

### ODS

```typescript
{
  ods: {
    maxRows: 10000, // Max rows to render per sheet (default 10000)
    sortable: true, // Enable column sorting (default true)
    header: true,   // First row is header (default true)
  }
}
```

## Custom Renderers

Register a renderer for any format:

```typescript
import { PolyRender, BaseRenderer, type PolyRenderOptions, type DocumentFormat } from '@polyrender/core'

class MarkdownRenderer extends BaseRenderer {
  readonly format: DocumentFormat = 'custom-markdown'

  protected async onMount(viewport: HTMLElement, options: PolyRenderOptions) {
    // Your rendering logic here
    const text = await this.loadText(options.source)
    const html = myMarkdownLib.render(text)
    viewport.innerHTML = html
    this.setReady({ format: 'custom-markdown', pageCount: 1 })
  }

  protected onDestroy() {}
}

// Register globally
PolyRender.registerRenderer('custom-markdown', () => new MarkdownRenderer())

// Use it
new PolyRender(container, {
  source: { type: 'url', url: '/readme.md' },
  format: 'custom-markdown',
})
```

## Supported Formats

| Format | Peer Dependency | Auto-detected Extensions |
|--------|----------------|-------------------------|
| PDF | `pdfjs-dist` | `.pdf` |
| EPUB | `epubjs` | `.epub` |
| DOCX | `docx-preview` | `.docx`, `.doc` |
| ODT | `jszip` | `.odt` |
| ODS | `xlsx` | `.ods` |
| CSV/TSV | `papaparse` | `.csv`, `.tsv` |
| Code | `highlight.js` | `.js`, `.ts`, `.py`, `.rs`, `.go`, `.java`, `.c`, `.cpp`, +80 more |
| Text | _(none)_ | `.txt` |
| Markdown | `highlight.js` | `.md` (rendered as syntax-highlighted code) |
| JSON | `highlight.js` | `.json` |
| XML/HTML | `highlight.js` | `.xml`, `.html`, `.svg` |
| Pages | _(none)_ | N/A (explicit `type: 'pages'`) |
| Chunked PDF | `pdfjs-dist` | N/A (explicit `type: 'chunked'`) |

## Browser Support

- Chrome/Edge 88+
- Firefox 78+
- Safari 15.4+ (OffscreenCanvas support for Web Worker rendering)

## Project Structure

```
packages/
├── core/           @polyrender/core — Framework-agnostic TypeScript core
│   ├── src/
│   │   ├── types.ts          # All interfaces and types
│   │   ├── polyrender.ts        # Main PolyRender class
│   │   ├── renderer.ts       # Abstract base renderer
│   │   ├── registry.ts       # Format → renderer factory mapping
│   │   ├── toolbar.ts        # Built-in toolbar DOM builder
│   │   ├── utils.ts          # Format detection, data conversion, DOM helpers
│   │   ├── styles.css        # CSS variables theme system
│   │   └── renderers/
│   │       ├── pdf.ts        # PDF (pdfjs-dist)
│   │       ├── browse-pages.ts # Pre-rendered page images
│   │       ├── chunked-pdf.ts  # Chunked PDF streaming
│   │       ├── epub.ts       # EPUB (epubjs)
│   │       ├── docx.ts       # DOCX (docx-preview)
│   │       ├── odt.ts        # ODT (jszip)
│   │       ├── ods.ts        # ODS (xlsx)
│   │       ├── csv.ts        # CSV/TSV (papaparse)
│   │       ├── code.ts       # Code (highlight.js)
│   │       └── text.ts       # Plain text
│   └── package.json
└── react/          @polyrender/react — React wrapper
    ├── src/
    │   ├── DocumentViewer.tsx       # Drop-in component
    │   ├── useDocumentRenderer.ts   # Headless hook
    │   └── index.ts
    └── package.json
```

## Repository

The source code is hosted in two locations:

- **Tangled** (primary): https://tangled.org/aria.pds.witchcraft.systems/polyrender
- **GitHub** (mirror): https://github.com/BuyMyMojo/polyrender

## License

Zlib

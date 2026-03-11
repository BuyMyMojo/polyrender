# @polyrender/core

Framework-agnostic TypeScript library for rendering documents in the browser. Supports PDF, EPUB, DOCX, ODT, ODS, CSV/TSV, source code, and plain text with a unified API.

For React support, see [`@polyrender/react`](https://www.npmjs.com/package/@polyrender/react).

## Installation

```bash
npm install @polyrender/core
```

Install peer dependencies only for the formats you need:

```bash
npm install pdfjs-dist       # PDF
npm install epubjs           # EPUB
npm install docx-preview     # DOCX
npm install jszip            # ODT
npm install xlsx             # ODS
npm install papaparse        # CSV/TSV
npm install highlight.js     # Code, Markdown, JSON, XML/HTML
```

## Usage

```typescript
import { PolyRender } from '@polyrender/core'
import '@polyrender/core/styles.css'

const viewer = new PolyRender(document.getElementById('viewer')!, {
  source: { type: 'url', url: '/document.pdf' },
  theme: 'dark',
  toolbar: true,
  onReady: (info) => console.log(`Loaded: ${info.pageCount} pages`),
  onPageChange: (page, total) => console.log(`Page ${page} of ${total}`),
})

// Imperative control
viewer.goToPage(5)
viewer.setZoom('fit-width')
viewer.setZoom(1.5)

// Clean up
viewer.destroy()
```

## Document Sources

### File (binary data)

```typescript
// From a File input
const file = inputElement.files[0]
source = { type: 'file', data: file, filename: file.name }

// From an ArrayBuffer
source = { type: 'file', data: arrayBuffer, mimeType: 'application/pdf' }
```

### URL

```typescript
source = { type: 'url', url: '/document.pdf' }

// With custom headers (e.g., auth)
source = {
  type: 'url',
  url: '/api/documents/123.pdf',
  fetchOptions: { headers: { Authorization: 'Bearer ...' } },
}
```

### Pre-rendered Pages

```typescript
// Direct array
source = {
  type: 'pages',
  pages: [
    { pageNumber: 1, imageUrl: '/pages/1.webp', width: 1654, height: 2339 },
    { pageNumber: 2, imageUrl: '/pages/2.webp', width: 1654, height: 2339 },
  ],
}

// Lazy fetch adapter
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

### Chunked PDF

```typescript
source = {
  type: 'chunked',
  totalPages: 500,
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

## Options

```typescript
new PolyRender(container, {
  source,                    // Required
  format?: DocumentFormat,   // Override auto-detection
  theme?: 'dark' | 'light' | 'system',  // Default: 'dark'
  className?: string,        // Extra CSS class on root element
  initialPage?: number,      // Starting page (default: 1)
  zoom?: number | 'fit-width' | 'fit-page' | 'auto',
  toolbar?: boolean | ToolbarConfig,

  // Callbacks
  onReady?: (info: DocumentInfo) => void,
  onPageChange?: (page: number, totalPages: number) => void,
  onZoomChange?: (zoom: number) => void,
  onError?: (error: PolyRenderError) => void,
  onLoadingChange?: (loading: boolean) => void,

  // Format-specific
  pdf?: PdfOptions,
  epub?: EpubOptions,
  code?: CodeOptions,
  csv?: CsvOptions,
  odt?: OdtOptions,
  ods?: OdsOptions,
})
```

### Format-specific Options

**PDF**
```typescript
pdf: {
  workerSrc?: string,       // pdf.js worker URL
  cMapUrl?: string,         // Character map directory
  textLayer?: boolean,      // Enable text selection (default true)
  annotationLayer?: boolean // Show PDF annotations (default false)
}
```

**EPUB**
```typescript
epub: {
  flow?: 'paginated' | 'scrolled', // Default: 'paginated'
  fontSize?: number,               // Font size in px (default 16)
  fontFamily?: string,             // Font override
}
```

**Code**
```typescript
code: {
  language?: string,    // Force language (auto-detected from extension)
  lineNumbers?: boolean, // Default true
  wordWrap?: boolean,    // Default false
  tabSize?: number,      // Default 2
}
```

**CSV/TSV**
```typescript
csv: {
  delimiter?: string, // Auto-detected
  header?: boolean,   // First row is header (default true)
  maxRows?: number,   // Default 10000
  sortable?: boolean, // Default true
}
```

**ODT**
```typescript
odt: {
  fontSize?: number,   // Base font size in px (default 16)
  fontFamily?: string, // Font override
}
```

**ODS**
```typescript
ods: {
  maxRows?: number,   // Max rows per sheet (default 10000)
  sortable?: boolean, // Default true
  header?: boolean,   // First row is header (default true)
}
```

## Events

Subscribe to events using `.on()` (returns an unsubscribe function):

```typescript
const off = viewer.on('pagechange', ({ page, totalPages }) => {
  console.log(`${page} / ${totalPages}`)
})

// Later:
off()
```

Available events: `ready`, `pagechange`, `zoomchange`, `loadingchange`, `error`, `destroy`.

## Theming

PolyRender uses CSS custom properties prefixed `--dv-*`. Override them on the `.polyrender` root element:

```css
.my-viewer .polyrender {
  --dv-bg: #1e1e2e;
  --dv-surface: #2a2a3e;
  --dv-text: #cdd6f4;
  --dv-accent: #89b4fa;
  --dv-border: #45475a;
}
```

Built-in themes: `dark` (default), `light`, `system`.

## Custom Renderers

```typescript
import { PolyRender, BaseRenderer } from '@polyrender/core'
import type { PolyRenderOptions, DocumentFormat } from '@polyrender/core'

class MarkdownRenderer extends BaseRenderer {
  readonly format: DocumentFormat = 'custom-markdown'

  protected async onMount(viewport: HTMLElement, options: PolyRenderOptions) {
    const text = await this.loadText(options.source)
    viewport.innerHTML = myMarkdownLib.render(text)
    this.setReady({ format: 'custom-markdown', pageCount: 1 })
  }

  protected onDestroy() {}
}

PolyRender.registerRenderer('custom-markdown', () => new MarkdownRenderer())
```

## Supported Formats

| Format | Peer Dependency | Auto-detected Extensions |
|--------|----------------|--------------------------|
| PDF | `pdfjs-dist` | `.pdf` |
| EPUB | `epubjs` | `.epub` |
| DOCX | `docx-preview` | `.docx`, `.doc` |
| ODT | `jszip` | `.odt` |
| ODS | `xlsx` | `.ods` |
| CSV/TSV | `papaparse` | `.csv`, `.tsv` |
| Code | `highlight.js` | `.js`, `.ts`, `.py`, `.rs`, `.go`, +80 more |
| Text | _(none)_ | `.txt` |
| Markdown | `highlight.js` | `.md` |
| JSON | `highlight.js` | `.json` |
| XML/HTML | `highlight.js` | `.xml`, `.html`, `.svg` |
| Pages | _(none)_ | N/A (explicit `type: 'pages'`) |
| Chunked PDF | `pdfjs-dist` | N/A (explicit `type: 'chunked'`) |

## License

Zlib

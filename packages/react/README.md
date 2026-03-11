# @polyrender/react

React component and hook for rendering documents in the browser. A thin wrapper around [`@polyrender/core`](https://www.npmjs.com/package/@polyrender/core) that handles React lifecycle, cleanup, and ref-based imperative control.

Supports PDF, EPUB, DOCX, ODT, ODS, CSV/TSV, source code, and plain text.

## Installation

```bash
npm install @polyrender/react @polyrender/core
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

## Quick Start

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

## `<DocumentViewer>`

Drop-in component. Props mirror `PolyRenderOptions` from `@polyrender/core`.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `source` | `DocumentSource \| null` | — | The document to render |
| `format` | `DocumentFormat` | auto | Override format detection |
| `theme` | `'dark' \| 'light' \| 'system'` | `'dark'` | Color theme |
| `className` | `string` | — | Extra CSS class on the root element |
| `style` | `React.CSSProperties` | — | Styles for the wrapper div (set width/height here) |
| `initialPage` | `number` | `1` | Starting page |
| `zoom` | `number \| 'fit-width' \| 'fit-page' \| 'auto'` | — | Initial zoom |
| `toolbar` | `boolean \| ToolbarConfig` | `true` | Toolbar visibility/config |
| `showPageNumbers` | `boolean` | — | Show page numbers |
| `onReady` | `(info: DocumentInfo) => void` | — | Fired when document is loaded |
| `onPageChange` | `(page, total) => void` | — | Fired on page navigation |
| `onZoomChange` | `(zoom: number) => void` | — | Fired on zoom change |
| `onError` | `(error: PolyRenderError) => void` | — | Fired on unrecoverable error |
| `onLoadingChange` | `(loading: boolean) => void` | — | Fired on loading state change |
| `pdf` | `PdfOptions` | — | PDF-specific options |
| `epub` | `EpubOptions` | — | EPUB-specific options |
| `code` | `CodeOptions` | — | Code-specific options |
| `csv` | `CsvOptions` | — | CSV/TSV-specific options |

### Imperative Control via Ref

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
      <button onClick={() => viewerRef.current?.goToPage(1)}>First page</button>
      <button onClick={() => viewerRef.current?.setZoom('fit-width')}>Fit width</button>
    </>
  )
}
```

`DocumentViewerRef` exposes: `goToPage(page)`, `setZoom(zoom)`, `getCurrentPage()`, `getPageCount()`, `getZoom()`.

## `useDocumentRenderer` (headless hook)

For building fully custom UI around the renderer:

```tsx
import { useDocumentRenderer } from '@polyrender/react'
import '@polyrender/core/styles.css'

function CustomViewer({ url }: { url: string }) {
  const { containerRef, state, goToPage, setZoom } = useDocumentRenderer({
    source: { type: 'url', url },
    theme: 'dark',
    toolbar: false,
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

### Return value

| Field | Type | Description |
|-------|------|-------------|
| `containerRef` | `RefObject<HTMLDivElement>` | Attach to your container element |
| `state` | `PolyRenderState` | Current viewer state |
| `goToPage` | `(page: number) => void` | Navigate to a page |
| `setZoom` | `(zoom) => void` | Set zoom level |
| `ready` | `boolean` | `true` after `onReady` fires |
| `error` | `PolyRenderError \| null` | Current error, if any |

`PolyRenderState` contains: `loading`, `error`, `currentPage`, `totalPages`, `zoom`, `documentInfo`.

## Document Sources

See [`@polyrender/core`](https://www.npmjs.com/package/@polyrender/core) for full documentation on `FileSource`, `UrlSource`, `PagesSource`, and `ChunkedSource`.

## Theming

Import and apply styles from `@polyrender/core`:

```tsx
import '@polyrender/core/styles.css'
```

Override CSS custom properties on the `.polyrender` root element:

```css
.my-viewer .polyrender {
  --dv-bg: #1e1e2e;
  --dv-text: #cdd6f4;
  --dv-accent: #89b4fa;
}
```

## Repository

The source code is hosted in two locations:

- **Tangled** (primary): https://tangled.org/aria.pds.witchcraft.systems/polyrender
- **GitHub** (mirror): https://github.com/BuyMyMojo/polyrender

This package lives under `packages/react` in the monorepo.

## License

Zlib

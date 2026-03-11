// ---------------------------------------------------------------------------
// Document Sources — what consumers pass in to tell PolyRender what to render
// ---------------------------------------------------------------------------

/** A direct file provided as binary data. */
export interface FileSource {
  type: 'file'
  /** The file content as a Blob, ArrayBuffer, or Uint8Array. */
  data: Blob | ArrayBuffer | Uint8Array
  /** MIME type override. If omitted, detected from filename or data. */
  mimeType?: string
  /** Original filename, used for format detection and display. */
  filename?: string
}

/** A URL pointing to a remotely-hosted document. */
export interface UrlSource {
  type: 'url'
  /** URL to fetch the document from. */
  url: string
  /** MIME type override. If omitted, detected from URL extension or response headers. */
  mimeType?: string
  /** Display filename. If omitted, derived from the URL path. */
  filename?: string
  /** Custom fetch options (headers, credentials, etc.). */
  fetchOptions?: RequestInit
}

/** Pre-rendered page images — for browsing without the original document. */
export interface PagesSource {
  type: 'pages'
  /** Direct page data array, OR a fetch adapter for lazy loading. */
  pages: PageData[] | PageFetchAdapter
  /** Optional text layer data for search and copy/paste over images. */
  textLayer?: TextLayerData[] | TextFetchAdapter
}

/**
 * Chunked document source — for streaming large files piece by piece.
 * Can provide PDF chunks (for full-fidelity rendering) and/or browse page
 * images (for fast initial display while chunks load).
 */
export interface ChunkedSource {
  type: 'chunked'
  /** PDF chunks for high-quality streaming, OR a fetch adapter. */
  chunks: ChunkData[] | ChunkFetchAdapter
  /** Total page count across all chunks. */
  totalPages: number
  /** Optional pre-rendered page images as fast fallback while chunks load. */
  browsePages?: PageData[] | PageFetchAdapter
  /** Optional text layer for browse pages. */
  textLayer?: TextLayerData[] | TextFetchAdapter
}

/** Union of all document source types. */
export type DocumentSource = FileSource | UrlSource | PagesSource | ChunkedSource


// ---------------------------------------------------------------------------
// Page & Chunk Data — individual units of content
// ---------------------------------------------------------------------------

/** A single pre-rendered page image. */
export interface PageData {
  /** 1-indexed page number. */
  pageNumber: number
  /** URL to the page image (mutually exclusive with imageBlob). */
  imageUrl?: string
  /** Blob containing the page image (mutually exclusive with imageUrl). */
  imageBlob?: Blob
  /** Image width in pixels. */
  width: number
  /** Image height in pixels. */
  height: number
}

/** A chunk of a PDF or other paginated document. */
export interface ChunkData {
  /** Binary data of the chunk (a valid, renderable PDF for PDF chunks). */
  data: ArrayBuffer | Blob
  /** First page in this chunk (1-indexed). */
  pageStart: number
  /** Last page in this chunk (1-indexed, inclusive). */
  pageEnd: number
}

/** Extracted text content for a single page, enabling search and copy/paste. */
export interface TextLayerData {
  /** 1-indexed page number this text belongs to. */
  pageNumber: number
  /** Array of text items with position information. */
  items: TextItem[]
}

/** A single text fragment with position data for overlay rendering. */
export interface TextItem {
  /** The text string. */
  str: string
  /** X position as fraction of page width (0–1). */
  x: number
  /** Y position as fraction of page height (0–1). */
  y: number
  /** Width as fraction of page width. */
  width: number
  /** Height as fraction of page height. */
  height: number
  /** Font size in points (optional). */
  fontSize?: number
}


// ---------------------------------------------------------------------------
// Fetch Adapters — for lazy-loading pages and chunks on demand
// ---------------------------------------------------------------------------

/** Adapter for lazily fetching individual page images. */
export interface PageFetchAdapter {
  /** Total number of pages in the document. */
  totalPages: number
  /** Fetch a single page image by 1-indexed page number. */
  fetchPage(pageNumber: number): Promise<PageData>
  /** Optional batch fetch for a range of pages (inclusive). */
  fetchRange?(startPage: number, endPage: number): Promise<PageData[]>
  /** Optional: called when adapter is no longer needed, to clean up. */
  dispose?(): void
}

/** Adapter for lazily fetching document chunks (e.g., split PDFs). */
export interface ChunkFetchAdapter {
  /** Total number of chunks. */
  totalChunks: number
  /** Total number of pages across all chunks. */
  totalPages: number
  /** Fetch a chunk by 0-indexed chunk index. */
  fetchChunk(index: number): Promise<ChunkData>
  /** Given a 1-indexed page number, return the chunk index that contains it. */
  getChunkIndexForPage(pageNumber: number): number
  /** Optional: called when adapter is no longer needed. */
  dispose?(): void
}

/** Adapter for lazily fetching text layer data. */
export interface TextFetchAdapter {
  /** Fetch text layer for a single page. */
  fetchPageText(pageNumber: number): Promise<TextLayerData>
  /** Optional batch fetch. */
  fetchRange?(startPage: number, endPage: number): Promise<TextLayerData[]>
  /** Optional dispose. */
  dispose?(): void
}


// ---------------------------------------------------------------------------
// Options — configuration for the PolyRender instance
// ---------------------------------------------------------------------------

export interface PolyRenderOptions {
  /** The document to render. */
  source: DocumentSource
  /** Explicit format override. If omitted, auto-detected from source. */
  format?: DocumentFormat
  /** Color theme. Defaults to 'dark'. */
  theme?: 'light' | 'dark' | 'system'
  /** Additional CSS class(es) to add to the root container. */
  className?: string
  /** Page to display initially (1-indexed). Defaults to 1. */
  initialPage?: number
  /** Initial zoom level. Number = scale factor, string = fit mode. */
  zoom?: number | 'fit-width' | 'fit-page' | 'auto'

  /** Toolbar configuration. `true` = default toolbar, `false` = hidden. */
  toolbar?: boolean | ToolbarConfig
  /** Show page number / total in the toolbar or overlay. */
  showPageNumbers?: boolean

  // --- Callbacks ---

  /** Called when the document is loaded and first page is rendered. */
  onReady?: (info: DocumentInfo) => void
  /** Called when the visible page changes. */
  onPageChange?: (page: number, totalPages: number) => void
  /** Called on unrecoverable errors. */
  onError?: (error: PolyRenderError) => void
  /** Called when zoom level changes. */
  onZoomChange?: (zoom: number) => void
  /** Called when loading state changes. */
  onLoadingChange?: (loading: boolean) => void

  // --- Format-specific options ---

  pdf?: PdfOptions
  code?: CodeOptions
  csv?: CsvOptions
  epub?: EpubOptions
  odt?: OdtOptions
  ods?: OdsOptions
}

export interface PdfOptions {
  /** URL to the pdf.js worker script. If omitted, uses bundled worker or CDN. */
  workerSrc?: string
  /** URL to the character map files directory. */
  cMapUrl?: string
  /** Whether to render the transparent text layer for selection. Default true. */
  textLayer?: boolean
  /** Whether to render the annotation layer. Default false. */
  annotationLayer?: boolean
}

export interface CodeOptions {
  /** Language identifier for syntax highlighting (e.g., 'typescript', 'python'). */
  language?: string
  /** Show line numbers. Default true. */
  lineNumbers?: boolean
  /** Enable word wrapping. Default false. */
  wordWrap?: boolean
  /** Tab size in spaces. Default 2. */
  tabSize?: number
}

export interface CsvOptions {
  /** Field delimiter character. Default auto-detected, falling back to ','. */
  delimiter?: string
  /** Whether the first row is a header. Default true. */
  header?: boolean
  /** Maximum number of rows to render. Default 10000. */
  maxRows?: number
  /** Enable column sorting. Default true. */
  sortable?: boolean
}

export interface EpubOptions {
  /** Flow mode: paginated (book-like) or scrolled. Default 'paginated'. */
  flow?: 'paginated' | 'scrolled'
  /** Font size in pixels. Default 16. */
  fontSize?: number
  /** Font family override. */
  fontFamily?: string
}

export interface OdtOptions {
  /** Font size in pixels to use as a base. Default 16. */
  fontSize?: number
  /** Font family override. */
  fontFamily?: string
}

export interface OdsOptions {
  /** Maximum number of rows to render per sheet. Default 10000. */
  maxRows?: number
  /** Enable column sorting. Default true. */
  sortable?: boolean
  /** Whether the first row is a header. Default true. */
  header?: boolean
}

export interface ToolbarConfig {
  /** Show page navigation controls. Default true. */
  navigation?: boolean
  /** Show zoom controls. Default true. */
  zoom?: boolean
  /** Show format/filename display. Default true. */
  info?: boolean
  /** Show download button (if source is downloadable). Default false. */
  download?: boolean
  /** Show fullscreen toggle. Default true. */
  fullscreen?: boolean
  /** Toolbar position. Default 'top'. */
  position?: 'top' | 'bottom'
}


// ---------------------------------------------------------------------------
// Document Info & State
// ---------------------------------------------------------------------------

/** Information about a loaded document, provided via the onReady callback. */
export interface DocumentInfo {
  /** Detected or overridden format. */
  format: DocumentFormat
  /** Total number of pages (or 1 for non-paginated formats). */
  pageCount: number
  /** Document title if available from metadata. */
  title?: string
  /** Document author if available from metadata. */
  author?: string
  /** Original filename if known. */
  filename?: string
  /** File size in bytes if known. */
  fileSize?: number
}

/** Current viewer state, queryable from a PolyRender instance. */
export interface PolyRenderState {
  /** Whether the document is currently loading. */
  loading: boolean
  /** Current error, if any. */
  error: PolyRenderError | null
  /** Current 1-indexed page number. */
  currentPage: number
  /** Total page count. */
  totalPages: number
  /** Current zoom scale factor. */
  zoom: number
  /** Loaded document info (null until onReady fires). */
  documentInfo: DocumentInfo | null
}


// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type PolyRenderErrorCode =
  | 'FORMAT_UNSUPPORTED'
  | 'FORMAT_DETECTION_FAILED'
  | 'PEER_DEPENDENCY_MISSING'
  | 'SOURCE_LOAD_FAILED'
  | 'RENDER_FAILED'
  | 'CHUNK_LOAD_FAILED'
  | 'PAGE_OUT_OF_RANGE'
  | 'UNKNOWN'

export class PolyRenderError extends Error {
  code: PolyRenderErrorCode
  detail?: unknown

  constructor(code: PolyRenderErrorCode, message: string, detail?: unknown) {
    super(message)
    this.name = 'PolyRenderError'
    this.code = code
    this.detail = detail
  }
}


// ---------------------------------------------------------------------------
// Format Types
// ---------------------------------------------------------------------------

export type DocumentFormat =
  | 'pdf'
  | 'epub'
  | 'docx'
  | 'odt'
  | 'ods'
  | 'csv'
  | 'tsv'
  | 'code'
  | 'text'
  | 'markdown'
  | 'html'
  | 'json'
  | 'xml'
  | 'pages'       // pre-rendered page images (no original document)
  | 'chunked-pdf' // chunked PDF streaming
  | (string & {})  // open union — consumers can register custom formats


// ---------------------------------------------------------------------------
// Renderer Interface — implemented by each format renderer
// ---------------------------------------------------------------------------

/**
 * The contract every format renderer must fulfill. Each renderer manages
 * its own DOM subtree within the provided container element. The PolyRender
 * orchestrator calls these methods in response to user actions and source
 * changes.
 */
export interface Renderer {
  /** Unique format identifier this renderer handles. */
  readonly format: DocumentFormat

  /**
   * Initialize and render the document into the container.
   * Called once after the renderer is created. The container is an empty div
   * scoped to this renderer — the renderer owns its entire DOM subtree.
   */
  mount(container: HTMLElement, options: PolyRenderOptions): Promise<void>

  /**
   * React to changed options (theme, zoom, etc.) without full re-mount.
   * Only the changed fields will be present.
   */
  update(changed: Partial<PolyRenderOptions>): Promise<void>

  /** Navigate to a specific page (1-indexed). */
  goToPage(page: number): void

  /** Get total page count. Returns 1 for non-paginated formats. */
  getPageCount(): number

  /** Get current page number (1-indexed). */
  getCurrentPage(): number

  /** Set zoom level. Accepts a scale factor or fit mode string. */
  setZoom(zoom: number | 'fit-width' | 'fit-page'): void

  /** Get current zoom as a numeric scale factor. */
  getZoom(): number

  /** Perform a text search within the document. Returns match count. */
  search?(query: string): Promise<number>

  /** Navigate to the next/previous search result. */
  nextSearchResult?(direction: 'forward' | 'backward'): void

  /** Clean up all DOM, event listeners, and resources. */
  destroy(): void
}

/**
 * Factory function that creates a renderer instance. Registered in the
 * format registry so PolyRender can instantiate the right renderer for each
 * document format.
 */
export type RendererFactory = () => Renderer


// ---------------------------------------------------------------------------
// Events (for vanilla JS event-driven usage)
// ---------------------------------------------------------------------------

export interface PolyRenderEventMap {
  ready: DocumentInfo
  pagechange: { page: number; totalPages: number }
  zoomchange: { zoom: number }
  error: PolyRenderError
  loadingchange: { loading: boolean }
  destroy: void
}

export type PolyRenderEventType = keyof PolyRenderEventMap

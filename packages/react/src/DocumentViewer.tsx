import { forwardRef, useImperativeHandle, useMemo } from 'react'
import type {
  DocumentSource,
  DocumentFormat,
  DocumentInfo,
  DocViewError,
  ToolbarConfig,
  PdfOptions,
  CodeOptions,
  CsvOptions,
  EpubOptions,
} from '@docview/core'
import { useDocumentRenderer } from './useDocumentRenderer.js'

export interface DocumentViewerProps {
  /** The document to render. Pass null/undefined to show nothing. */
  source: DocumentSource | null | undefined

  /** Explicit format override. If omitted, auto-detected from source. */
  format?: DocumentFormat

  /** Color theme. Defaults to 'dark'. */
  theme?: 'light' | 'dark' | 'system'

  /** Additional CSS class(es) for the root container. */
  className?: string

  /** Inline styles for the outer wrapper div (set width/height here). */
  style?: React.CSSProperties

  /** Page to display initially (1-indexed). Defaults to 1. */
  initialPage?: number

  /** Initial zoom level. */
  zoom?: number | 'fit-width' | 'fit-page' | 'auto'

  /** Toolbar configuration. true = default, false = hidden. */
  toolbar?: boolean | ToolbarConfig

  /** Show page numbers. */
  showPageNumbers?: boolean

  // --- Callbacks ---
  onReady?: (info: DocumentInfo) => void
  onPageChange?: (page: number, totalPages: number) => void
  onZoomChange?: (zoom: number) => void
  onError?: (error: DocViewError) => void
  onLoadingChange?: (loading: boolean) => void

  // --- Format-specific options ---
  pdf?: PdfOptions
  code?: CodeOptions
  csv?: CsvOptions
  epub?: EpubOptions
}

export interface DocumentViewerRef {
  /** Navigate to a specific page (1-indexed). */
  goToPage: (page: number) => void
  /** Set zoom level. */
  setZoom: (zoom: number | 'fit-width' | 'fit-page') => void
  /** Get current page number. */
  getCurrentPage: () => number
  /** Get total page count. */
  getPageCount: () => number
  /** Get current zoom level. */
  getZoom: () => number
}

/**
 * React component for rendering documents of any supported format.
 *
 * Wraps the framework-agnostic `@docview/core` library with React lifecycle
 * management, ref-based imperative API, and automatic cleanup.
 *
 * @example
 * ```tsx
 * import { DocumentViewer } from '@docview/react'
 * import '@docview/core/styles.css'
 *
 * function App() {
 *   return (
 *     <DocumentViewer
 *       source={{ type: 'url', url: '/report.pdf' }}
 *       theme="dark"
 *       style={{ width: '100%', height: '80vh' }}
 *       onReady={(info) => console.log(`Loaded ${info.pageCount} pages`)}
 *     />
 *   )
 * }
 * ```
 *
 * @example Chunked / pre-rendered pages
 * ```tsx
 * <DocumentViewer
 *   source={{
 *     type: 'pages',
 *     pages: {
 *       totalPages: 200,
 *       fetchPage: async (n) => ({
 *         pageNumber: n,
 *         imageUrl: `/api/pages/${n}.webp`,
 *         width: 1654,
 *         height: 2339,
 *       }),
 *     },
 *   }}
 * />
 * ```
 *
 * @example Imperative control via ref
 * ```tsx
 * const viewerRef = useRef<DocumentViewerRef>(null)
 *
 * <DocumentViewer ref={viewerRef} source={source} />
 * <button onClick={() => viewerRef.current?.goToPage(10)}>Go to page 10</button>
 * ```
 */
export const DocumentViewer = forwardRef<DocumentViewerRef, DocumentViewerProps>(
  function DocumentViewer(props, ref) {
    const {
      source,
      format,
      theme,
      className,
      style,
      initialPage,
      zoom,
      toolbar,
      showPageNumbers,
      onReady,
      onPageChange,
      onZoomChange,
      onError,
      onLoadingChange,
      pdf,
      code,
      csv,
      epub,
    } = props

    const {
      containerRef,
      state,
      goToPage,
      setZoom,
    } = useDocumentRenderer({
      source: source ?? undefined,
      format,
      theme,
      className,
      initialPage,
      zoom,
      toolbar,
      showPageNumbers,
      onReady,
      onPageChange,
      onZoomChange,
      onError,
      onLoadingChange,
      pdf,
      code,
      csv,
      epub,
    })

    // Expose imperative API via ref
    useImperativeHandle(ref, () => ({
      goToPage,
      setZoom,
      getCurrentPage: () => state.currentPage,
      getPageCount: () => state.totalPages,
      getZoom: () => state.zoom,
    }), [goToPage, setZoom, state.currentPage, state.totalPages, state.zoom])

    const containerStyle = useMemo<React.CSSProperties>(() => ({
      width: '100%',
      height: '100%',
      minHeight: 200,
      ...style,
    }), [style])

    return (
      <div
        ref={containerRef as any}
        style={containerStyle}
        data-docview-wrapper=""
      />
    )
  },
)

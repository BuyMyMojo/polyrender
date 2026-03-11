// Components
export { DocumentViewer } from './DocumentViewer.js'
export type { DocumentViewerProps, DocumentViewerRef } from './DocumentViewer.js'

// Hook
export { useDocumentRenderer } from './useDocumentRenderer.js'
export type { UseDocumentRendererOptions, UseDocumentRendererReturn } from './useDocumentRenderer.js'

// Re-export core types for convenience (so consumers don't need to
// install @polyrender/core separately just for types)
export type {
  DocumentSource,
  FileSource,
  UrlSource,
  PagesSource,
  ChunkedSource,
  PageData,
  ChunkData,
  TextLayerData,
  TextItem,
  PageFetchAdapter,
  ChunkFetchAdapter,
  TextFetchAdapter,
  PolyRenderOptions,
  PdfOptions,
  CodeOptions,
  CsvOptions,
  EpubOptions,
  ToolbarConfig,
  DocumentInfo,
  PolyRenderState,
  DocumentFormat,
  PolyRenderEventMap,
  PolyRenderEventType,
  PolyRenderErrorCode,
} from '@polyrender/core'

export { PolyRenderError, PolyRender } from '@polyrender/core'

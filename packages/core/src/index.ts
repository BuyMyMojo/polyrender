// Main entry point
export { DocView } from './docview.js'

// Types
export type {
  // Sources
  DocumentSource,
  FileSource,
  UrlSource,
  PagesSource,
  ChunkedSource,

  // Data
  PageData,
  ChunkData,
  TextLayerData,
  TextItem,

  // Fetch Adapters
  PageFetchAdapter,
  ChunkFetchAdapter,
  TextFetchAdapter,

  // Options
  DocViewOptions,
  PdfOptions,
  CodeOptions,
  CsvOptions,
  EpubOptions,
  OdtOptions,
  OdsOptions,
  ToolbarConfig,

  // State & Info
  DocumentInfo,
  DocViewState,
  DocumentFormat,

  // Renderer interface (for custom renderers)
  Renderer,
  RendererFactory,

  // Events
  DocViewEventMap,
  DocViewEventType,

  // Errors
  DocViewErrorCode,
} from './types.js'

export { DocViewError } from './types.js'

// Registry (for custom renderer registration)
export { registry } from './registry.js'

// Base renderer (for building custom renderers)
export { BaseRenderer } from './renderer.js'

// Built-in renderers (for direct use or extension)
export {
  PdfRenderer,
  BrowsePagesRenderer,
  ChunkedPdfRenderer,
  EpubRenderer,
  DocxRenderer,
  OdtRenderer,
  OdsRenderer,
  CsvRenderer,
  CodeRenderer,
  TextRenderer,
} from './renderers/index.js'

// Utilities (for custom renderer authors)
export {
  detectFormat,
  getRendererFormat,
  getLanguageFromExtension,
  getExtension,
  toArrayBuffer,
  toBlob,
  toText,
  fetchAsBuffer,
} from './utils.js'

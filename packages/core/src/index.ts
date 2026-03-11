// Main entry point
export { PolyRender } from './polyrender.js'

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
  PolyRenderOptions,
  PdfOptions,
  CodeOptions,
  CsvOptions,
  EpubOptions,
  OdtOptions,
  OdsOptions,
  ToolbarConfig,

  // State & Info
  DocumentInfo,
  PolyRenderState,
  DocumentFormat,

  // Renderer interface (for custom renderers)
  Renderer,
  RendererFactory,

  // Events
  PolyRenderEventMap,
  PolyRenderEventType,

  // Errors
  PolyRenderErrorCode,
} from './types.js'

export { PolyRenderError } from './types.js'

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

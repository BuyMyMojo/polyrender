export { PdfRenderer } from './pdf.js'
export { BrowsePagesRenderer } from './browse-pages.js'
export { ChunkedPdfRenderer } from './chunked-pdf.js'
export { EpubRenderer } from './epub.js'
export { DocxRenderer } from './docx.js'
export { OdtRenderer } from './odt.js'
export { OdsRenderer } from './ods.js'
export { CsvRenderer } from './csv.js'
export { CodeRenderer } from './code.js'
export { TextRenderer } from './text.js'

import { registry } from '../registry.js'
import { PdfRenderer } from './pdf.js'
import { BrowsePagesRenderer } from './browse-pages.js'
import { ChunkedPdfRenderer } from './chunked-pdf.js'
import { EpubRenderer } from './epub.js'
import { DocxRenderer } from './docx.js'
import { OdtRenderer } from './odt.js'
import { OdsRenderer } from './ods.js'
import { CsvRenderer } from './csv.js'
import { CodeRenderer } from './code.js'
import { TextRenderer } from './text.js'

/**
 * Register all built-in renderers with the format registry.
 * Called automatically when the library is imported.
 */
export function registerBuiltinRenderers(): void {
  registry.register('pdf', () => new PdfRenderer())
  registry.register('pages', () => new BrowsePagesRenderer())
  registry.register('chunked-pdf', () => new ChunkedPdfRenderer())
  registry.register('epub', () => new EpubRenderer())
  registry.register('docx', () => new DocxRenderer())
  registry.register('odt', () => new OdtRenderer())
  registry.register('ods', () => new OdsRenderer())
  registry.register('csv', () => new CsvRenderer())
  registry.register('code', () => new CodeRenderer())
  registry.register('text', () => new TextRenderer())
}

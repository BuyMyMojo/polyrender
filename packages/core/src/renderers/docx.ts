import type { DocViewOptions, DocumentFormat } from '../types.js'
import { BaseRenderer } from '../renderer.js'
import { el, toArrayBuffer, fetchAsBuffer, requirePeerDep } from '../utils.js'

interface DocxPreview {
  renderAsync(
    data: ArrayBuffer | Blob,
    container: HTMLElement,
    styleContainer?: HTMLElement | null,
    options?: {
      className?: string
      inWrapper?: boolean
      ignoreWidth?: boolean
      ignoreHeight?: boolean
      ignoreFonts?: boolean
      breakPages?: boolean
      ignoreLastRenderedPageBreak?: boolean
      experimental?: boolean
      trimXmlDeclaration?: boolean
      useBase64URL?: boolean
      renderHeaders?: boolean
      renderFooters?: boolean
      renderFootnotes?: boolean
      renderEndnotes?: boolean
    },
  ): Promise<void>
}

/**
 * Renders DOCX files using docx-preview, preserving layout, styles,
 * tables, headers/footers, and embedded images with high fidelity.
 */
export class DocxRenderer extends BaseRenderer {
  readonly format: DocumentFormat = 'docx'

  private docxContainer!: HTMLElement

  protected async onMount(viewport: HTMLElement, options: DocViewOptions): Promise<void> {
    this.showLoading('Rendering document…')

    const docxPreview = await requirePeerDep<DocxPreview>('docx-preview', 'DOCX')

    const data = await this.loadData(options)

    this.hideLoading()

    this.docxContainer = el('div', 'dv-docx-container')
    viewport.appendChild(this.docxContainer)

    await docxPreview.renderAsync(data, this.docxContainer, null, {
      className: 'docx',
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
      breakPages: true,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
      renderEndnotes: true,
      useBase64URL: true,
    })

    // Count rendered page sections for page count
    const pages = this.docxContainer.querySelectorAll('section.docx')
    const pageCount = Math.max(1, pages.length)

    this.setReady({
      format: 'docx',
      pageCount,
      filename: this.getFilename(options),
    })
  }

  private async loadData(options: DocViewOptions): Promise<ArrayBuffer> {
    const source = options.source
    if (source.type === 'file') return toArrayBuffer(source.data)
    if (source.type === 'url') return fetchAsBuffer(source.url, source.fetchOptions)
    throw new Error('DOCX renderer requires a file or url source.')
  }

  private getFilename(options: DocViewOptions): string | undefined {
    const source = options.source
    if ('filename' in source && source.filename) return source.filename
    if (source.type === 'url') return source.url.split('/').pop()?.split('?')[0]
    return undefined
  }

  protected onDestroy(): void {
    // docx-preview doesn't expose a destroy method — DOM cleanup is sufficient
  }
}

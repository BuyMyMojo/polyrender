import type { PolyRenderOptions, DocumentFormat } from '../types.js'
import { BaseRenderer } from '../renderer.js'
import { el, toText, fetchAsBuffer } from '../utils.js'

/**
 * Renders plain text files with optional line numbers.
 * Uses proportional font for prose (.txt) and monospace for other text files.
 */
export class TextRenderer extends BaseRenderer {
  readonly format: DocumentFormat = 'text'

  private textContainer!: HTMLElement

  protected async onMount(viewport: HTMLElement, options: PolyRenderOptions): Promise<void> {
    this.showLoading('Loading text…')

    const text = await this.loadText(options)

    this.hideLoading()

    // Determine if monospace
    const ext = this.getExtension(options)
    const isMonospace = ext !== 'txt' && ext !== 'text'

    this.textContainer = el('div', `dv-text-container${isMonospace ? ' dv-monospace' : ''}`)
    this.textContainer.textContent = text
    viewport.appendChild(this.textContainer)

    const lineCount = text.split('\n').length
    this.setReady({
      format: 'text',
      pageCount: 1,
      filename: this.getFilename(options),
    })
  }

  private async loadText(options: PolyRenderOptions): Promise<string> {
    const source = options.source
    if (source.type === 'file') {
      return toText(source.data)
    }
    if (source.type === 'url') {
      const buffer = await fetchAsBuffer(source.url, source.fetchOptions)
      return new TextDecoder('utf-8').decode(buffer)
    }
    return ''
  }

  private getExtension(options: PolyRenderOptions): string {
    const source = options.source
    const name = ('filename' in source ? source.filename : undefined)
      ?? (source.type === 'url' ? source.url : '')
    const dot = name.lastIndexOf('.')
    return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
  }

  private getFilename(options: PolyRenderOptions): string | undefined {
    const source = options.source
    if ('filename' in source && source.filename) return source.filename
    if (source.type === 'url') {
      return source.url.split('/').pop()?.split('?')[0]
    }
    return undefined
  }

  protected onDestroy(): void {
    // No external resources to clean up
  }
}

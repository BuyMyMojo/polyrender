import type { DocViewOptions, DocumentFormat } from '../types.js'
import { BaseRenderer } from '../renderer.js'
import { el, toArrayBuffer, fetchAsBuffer, requirePeerDep } from '../utils.js'

interface EpubJSModule {
  default?: new (options?: { openAs?: string }) => EpubBook
}

interface EpubBook {
  open(input: ArrayBuffer | string): Promise<void>
  renderTo(element: HTMLElement, options?: {
    width?: string | number
    height?: string | number
    flow?: string
    spread?: string
  }): EpubRendition
  loaded: {
    metadata: Promise<{ title?: string; creator?: string }>
    spine: Promise<{ items: { index: number }[] }>
  }
  destroy(): void
}

interface EpubRendition {
  display(target?: string | number): Promise<void>
  next(): Promise<void>
  prev(): Promise<void>
  on(event: string, callback: (...args: any[]) => void): void
  themes: {
    fontSize(size: string): void
    font(family: string): void
    override(name: string, value: string): void
  }
  currentLocation(): EpubLocation | null
  destroy(): void
}

interface EpubLocation {
  start: { index: number; displayed: { page: number; total: number } }
  end: { index: number }
}

/**
 * Renders EPUB files using epub.js with paginated or scrolled reading modes,
 * theme integration, and keyboard navigation.
 */
export class EpubRenderer extends BaseRenderer {
  readonly format: DocumentFormat = 'epub'

  private book: EpubBook | null = null
  private rendition: EpubRendition | null = null
  private epubContainer!: HTMLElement
  private keyHandler: ((e: KeyboardEvent) => void) | null = null

  protected async onMount(viewport: HTMLElement, options: DocViewOptions): Promise<void> {
    this.showLoading('Loading book…')

    const epubjs = await requirePeerDep<EpubJSModule>('epubjs', 'EPUB')
    // Handle both ESM default-unwrapped and wrapped module shapes
    const EpubBook = (typeof epubjs === 'function' ? epubjs : epubjs.default) as new (options?: { openAs?: string }) => EpubBook

    this.book = new EpubBook()

    // Load content
    const source = options.source
    if (source.type === 'file') {
      const buffer = await toArrayBuffer(source.data)
      await this.book.open(buffer)
    } else if (source.type === 'url') {
      await this.book.open(source.url)
    } else {
      throw new Error('EPUB renderer requires a file or url source.')
    }

    this.hideLoading()

    // Create container
    this.epubContainer = el('div', 'dv-epub-container')
    viewport.appendChild(this.epubContainer)

    // epub.js requires concrete pixel dimensions to render
    const rect = viewport.getBoundingClientRect()
    const width = Math.floor(rect.width) || 600
    const height = Math.floor(rect.height - 4) || 400 // -4 for breathing room

    // Render
    const epubOpts = options.epub ?? {}
    const flow = epubOpts.flow ?? 'paginated'

    this.rendition = this.book.renderTo(this.epubContainer, {
      width,
      height,
      flow,
      spread: 'none',
    })

    // Apply theme
    if (epubOpts.fontSize) {
      this.rendition.themes.fontSize(`${epubOpts.fontSize}px`)
    }
    if (epubOpts.fontFamily) {
      this.rendition.themes.font(epubOpts.fontFamily)
    }

    // Theme colors from CSS variables
    const isDark = options.theme !== 'light'
    if (isDark) {
      this.rendition.themes.override('color', '#e6edf3')
      this.rendition.themes.override('background', '#0d1117')
    }

    // Track location changes
    this.rendition.on('relocated', (location: EpubLocation) => {
      if (location?.start) {
        this.state.currentPage = location.start.displayed.page
        this.state.totalPages = location.start.displayed.total
        this.emitPageChange()
      }
    })

    await this.rendition.display()

    // Keyboard navigation
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        this.rendition?.next()
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        this.rendition?.prev()
      }
    }
    document.addEventListener('keydown', this.keyHandler)

    // Get metadata
    let title: string | undefined
    let author: string | undefined
    try {
      const meta = await this.book.loaded.metadata
      title = meta.title || undefined
      author = meta.creator || undefined
    } catch {
      // Non-fatal
    }

    // Estimate page count from spine
    let pageCount = 1
    try {
      const spine = await this.book.loaded.spine
      pageCount = spine.items.length
    } catch {
      // Non-fatal
    }

    this.setReady({
      format: 'epub',
      pageCount,
      title,
      author,
      filename: this.getFilename(options),
    })
  }

  protected onPageChange(page: number): void {
    this.rendition?.display(String(page - 1))
  }

  private getFilename(options: DocViewOptions): string | undefined {
    const source = options.source
    if ('filename' in source && source.filename) return source.filename
    if (source.type === 'url') return source.url.split('/').pop()?.split('?')[0]
    return undefined
  }

  protected onDestroy(): void {
    if (this.keyHandler) {
      document.removeEventListener('keydown', this.keyHandler)
    }
    this.rendition?.destroy()
    this.book?.destroy()
    this.rendition = null
    this.book = null
  }
}

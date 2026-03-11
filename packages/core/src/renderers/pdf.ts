import type { DocViewOptions, DocumentFormat, DocumentInfo } from '../types.js'
import { DocViewError } from '../types.js'
import { BaseRenderer } from '../renderer.js'
import {
  el,
  toArrayBuffer,
  fetchAsBuffer,
  requirePeerDep,
  clamp,
  debounce,
} from '../utils.js'

interface PdfjsLib {
  getDocument(params: {
    data?: ArrayBuffer
    url?: string
    cMapUrl?: string
    cMapPacked?: boolean
    enableXfa?: boolean
  }): { promise: Promise<PdfjsDocument> }
  GlobalWorkerOptions: { workerSrc: string }
}

interface PdfjsDocument {
  numPages: number
  getPage(num: number): Promise<PdfjsPage>
  getMetadata(): Promise<{ info?: { Title?: string; Author?: string } }>
  destroy(): void
}

interface PdfjsPage {
  getViewport(params: { scale: number }): { width: number; height: number }
  render(params: {
    canvasContext: CanvasRenderingContext2D
    viewport: { width: number; height: number }
  }): { promise: Promise<void> }
  getTextContent(): Promise<{ items: PdfjsTextItem[] }>
  cleanup(): void
}

interface PdfjsTextItem {
  str: string
  transform: number[]
  width: number
  height: number
}

export class PdfRenderer extends BaseRenderer {
  readonly format: DocumentFormat = 'pdf'

  private pdfDoc: PdfjsDocument | null = null
  private pagesContainer!: HTMLElement
  private pageElements: HTMLElement[] = []
  private pageCanvases: HTMLCanvasElement[] = []
  private renderedPages = new Set<number>()
  private baseScale = 1
  private scrollObserver: IntersectionObserver | null = null
  private resizeObserver: ResizeObserver | null = null
  private debouncedRender: ReturnType<typeof debounce> | null = null

  protected async onMount(viewport: HTMLElement, options: DocViewOptions): Promise<void> {
    const loadingEl = this.showLoading('Loading PDF…')

    // Load pdfjs-dist
    const pdfjsLib = await requirePeerDep<PdfjsLib>('pdfjs-dist', 'PDF')

    // Configure worker
    if (options.pdf?.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = options.pdf.workerSrc
    }

    // Load the document
    const data = await this.loadSource(options)
    const loadingParams: Parameters<PdfjsLib['getDocument']>[0] = {}

    if (typeof data === 'string') {
      loadingParams.url = data
    } else {
      loadingParams.data = data
    }

    if (options.pdf?.cMapUrl) {
      loadingParams.cMapUrl = options.pdf.cMapUrl
      loadingParams.cMapPacked = true
    }

    this.pdfDoc = await pdfjsLib.getDocument(loadingParams).promise

    // Get metadata
    let title: string | undefined
    let author: string | undefined
    try {
      const meta = await this.pdfDoc.getMetadata()
      title = meta.info?.Title || undefined
      author = meta.info?.Author || undefined
    } catch {
      // Metadata extraction can fail on some PDFs — non-fatal
    }

    // Create pages container
    this.pagesContainer = el('div', 'dv-pages')
    viewport.appendChild(this.pagesContainer)

    // Create placeholder elements for every page
    const numPages = this.pdfDoc.numPages
    for (let i = 1; i <= numPages; i++) {
      const pageEl = el('div', 'dv-page')
      pageEl.dataset.page = String(i)
      this.pageElements.push(pageEl)
      this.pagesContainer.appendChild(pageEl)
    }

    // Determine initial scale
    const firstPage = await this.pdfDoc.getPage(1)
    const initialViewport = firstPage.getViewport({ scale: 1 })
    const containerWidth = viewport.clientWidth - 48 // padding
    this.baseScale = containerWidth / initialViewport.width

    const zoomOption = options.zoom ?? 'fit-width'
    if (typeof zoomOption === 'number') {
      this.state.zoom = zoomOption
    } else {
      this.state.zoom = this.baseScale
    }

    // Set placeholder sizes
    for (let i = 0; i < numPages; i++) {
      const pageEl = this.pageElements[i]
      pageEl.style.width = `${initialViewport.width * this.state.zoom}px`
      pageEl.style.height = `${initialViewport.height * this.state.zoom}px`
      pageEl.style.background = 'var(--dv-page-bg)'
    }

    loadingEl.remove()

    // Set up intersection observer for lazy page rendering
    this.scrollObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const pageNum = parseInt(
              (entry.target as HTMLElement).dataset.page!,
              10,
            )
            this.renderPage(pageNum)
          }
        }
      },
      { root: viewport, rootMargin: '200% 0px' },
    )

    for (const pageEl of this.pageElements) {
      this.scrollObserver.observe(pageEl)
    }

    // Track current page on scroll
    this.debouncedRender = debounce(() => this.updateCurrentPage(), 100)
    viewport.addEventListener('scroll', this.debouncedRender)

    // Resize observer for fit-width recalculation
    this.resizeObserver = new ResizeObserver(() => {
      const newWidth = viewport.clientWidth - 48
      if (Math.abs(newWidth - containerWidth) > 10) {
        this.baseScale = newWidth / initialViewport.width
      }
    })
    this.resizeObserver.observe(viewport)

    // Ready
    this.setReady({
      format: 'pdf',
      pageCount: numPages,
      title,
      author,
      filename: this.getFilename(options),
    })

    // Navigate to initial page
    if (options.initialPage && options.initialPage > 1) {
      this.goToPage(options.initialPage)
    }
  }

  private async loadSource(
    options: DocViewOptions,
  ): Promise<ArrayBuffer | string> {
    const source = options.source
    if (source.type === 'url') {
      // pdfjs can handle URL directly for range requests
      return source.url
    }
    if (source.type === 'file') {
      return toArrayBuffer(source.data)
    }
    throw new DocViewError(
      'SOURCE_LOAD_FAILED',
      'PDF renderer requires a file or url source.',
    )
  }

  private async renderPage(pageNum: number): Promise<void> {
    if (!this.pdfDoc || this.renderedPages.has(pageNum)) return
    this.renderedPages.add(pageNum)

    const page = await this.pdfDoc.getPage(pageNum)
    const viewport = page.getViewport({ scale: this.state.zoom })
    const pageEl = this.pageElements[pageNum - 1]

    // Create canvas
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    const dpr = window.devicePixelRatio || 1
    canvas.width = viewport.width * dpr
    canvas.height = viewport.height * dpr
    canvas.style.width = `${viewport.width}px`
    canvas.style.height = `${viewport.height}px`
    ctx.scale(dpr, dpr)

    pageEl.style.width = `${viewport.width}px`
    pageEl.style.height = `${viewport.height}px`
    pageEl.innerHTML = ''
    pageEl.appendChild(canvas)
    this.pageCanvases[pageNum - 1] = canvas

    // Render
    await page.render({ canvasContext: ctx, viewport }).promise

    // Text layer
    const textLayerEnabled = this.options.pdf?.textLayer !== false
    if (textLayerEnabled) {
      try {
        const textContent = await page.getTextContent()
        this.renderTextLayer(pageEl, textContent.items, viewport)
      } catch {
        // Text extraction can fail — non-fatal
      }
    }

    page.cleanup()
  }

  private renderTextLayer(
    pageEl: HTMLElement,
    items: PdfjsTextItem[],
    viewport: { width: number; height: number },
  ): void {
    const layer = el('div', 'dv-text-layer')
    for (const item of items) {
      if (!item.str.trim()) continue
      const span = document.createElement('span')
      span.textContent = item.str
      // item.transform: [scaleX, skewY, skewX, scaleY, translateX, translateY]
      const tx = item.transform[4]
      const ty = item.transform[5]
      const fontSize = Math.sqrt(
        item.transform[0] * item.transform[0] +
        item.transform[1] * item.transform[1],
      )
      span.style.left = `${(tx / viewport.width) * 100}%`
      span.style.bottom = `${(ty / viewport.height) * 100}%`
      span.style.fontSize = `${fontSize * this.state.zoom}px`
      span.style.fontFamily = 'sans-serif'
      layer.appendChild(span)
    }
    pageEl.appendChild(layer)
  }

  private updateCurrentPage(): void {
    const viewportRect = this.viewport.getBoundingClientRect()
    const viewportMid = viewportRect.top + viewportRect.height / 2

    for (let i = 0; i < this.pageElements.length; i++) {
      const rect = this.pageElements[i].getBoundingClientRect()
      if (rect.top <= viewportMid && rect.bottom >= viewportMid) {
        const newPage = i + 1
        if (newPage !== this.state.currentPage) {
          this.state.currentPage = newPage
          this.emitPageChange()
        }
        return
      }
    }
  }

  protected onPageChange(page: number): void {
    const pageEl = this.pageElements[page - 1]
    if (pageEl) {
      pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  protected onZoomChange(zoom: number): void {
    const clamped = clamp(zoom, 0.25, 5)
    this.state.zoom = clamped

    // Re-render all visible pages at new zoom
    this.renderedPages.clear()
    for (let i = 0; i < this.pageElements.length; i++) {
      const pageEl = this.pageElements[i]
      pageEl.innerHTML = ''
      // Update placeholder size (approximate from first page ratio)
      if (this.pdfDoc) {
        const scale = clamped
        // We'll just trigger re-render via intersection observer
        pageEl.style.width = ''
        pageEl.style.height = ''
      }
    }

    // Re-render by re-observing (intersection observer will trigger)
    if (this.scrollObserver && this.pdfDoc) {
      this.reRenderVisiblePages()
    }
  }

  private async reRenderVisiblePages(): Promise<void> {
    if (!this.pdfDoc) return
    const firstPage = await this.pdfDoc.getPage(1)
    const vp = firstPage.getViewport({ scale: this.state.zoom })

    for (const pageEl of this.pageElements) {
      pageEl.style.width = `${vp.width}px`
      pageEl.style.height = `${vp.height}px`
    }

    // The intersection observer will re-trigger rendering for visible pages
    for (const pageEl of this.pageElements) {
      this.scrollObserver!.unobserve(pageEl)
      this.scrollObserver!.observe(pageEl)
    }
  }

  protected resolveZoomMode(mode: 'fit-width' | 'fit-page'): number {
    return this.baseScale * (mode === 'fit-page' ? 0.95 : 1)
  }

  private getFilename(options: DocViewOptions): string | undefined {
    const src = options.source
    if ('filename' in src && src.filename) return src.filename
    if (src.type === 'url') {
      const segments = src.url.split('/').filter(Boolean)
      return segments.pop()?.split('?')[0]
    }
    return undefined
  }

  protected onDestroy(): void {
    this.scrollObserver?.disconnect()
    this.resizeObserver?.disconnect()
    this.debouncedRender?.cancel()
    if (this.viewport) {
      this.viewport.removeEventListener('scroll', this.debouncedRender as EventListener)
    }
    this.pdfDoc?.destroy()
    this.pdfDoc = null
    this.pageElements = []
    this.pageCanvases = []
    this.renderedPages.clear()
  }
}

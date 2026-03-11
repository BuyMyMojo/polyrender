import type {
  PolyRenderOptions,
  DocumentFormat,
  PageData,
  PageFetchAdapter,
  PagesSource,
  TextLayerData,
  TextFetchAdapter,
} from '../types.js'
import { PolyRenderError } from '../types.js'
import { BaseRenderer } from '../renderer.js'
import { el, clamp, debounce } from '../utils.js'

/**
 * Renders pre-rendered page images (WebP, JPEG, PNG) with lazy loading,
 * scroll-based page tracking, and optional text layer overlay.
 *
 * This is the primary viewer for chunked documents in "browse" mode —
 * fast, lightweight, works on mobile.
 */
export class BrowsePagesRenderer extends BaseRenderer {
  readonly format: DocumentFormat = 'pages'

  private pagesContainer!: HTMLElement
  private pageElements: HTMLElement[] = []
  private pages: PageData[] = []
  private fetchAdapter: PageFetchAdapter | null = null
  private textData: TextLayerData[] | null = null
  private textFetcher: TextFetchAdapter | null = null
  private loadedPages = new Set<number>()
  private observer: IntersectionObserver | null = null
  private debouncedScroll: ReturnType<typeof debounce> | null = null

  protected async onMount(viewport: HTMLElement, options: PolyRenderOptions): Promise<void> {
    const loadingEl = this.showLoading('Loading pages…')
    const source = options.source as PagesSource

    // Resolve pages — direct data or fetch adapter
    if (Array.isArray(source.pages)) {
      this.pages = source.pages.sort((a, b) => a.pageNumber - b.pageNumber)
    } else {
      this.fetchAdapter = source.pages
    }

    // Resolve text layer
    if (source.textLayer) {
      if (Array.isArray(source.textLayer)) {
        this.textData = source.textLayer
      } else {
        this.textFetcher = source.textLayer
      }
    }

    const totalPages = this.fetchAdapter?.totalPages ?? this.pages.length
    if (totalPages === 0) {
      throw new PolyRenderError('RENDER_FAILED', 'No pages provided.')
    }

    // Create pages container
    this.pagesContainer = el('div', 'dv-pages')
    viewport.appendChild(this.pagesContainer)

    // Create placeholder elements
    for (let i = 1; i <= totalPages; i++) {
      const pageEl = el('div', 'dv-page dv-browse-page')
      pageEl.dataset.page = String(i)

      // Set placeholder dimensions from direct data if available
      const pageData = this.pages.find((p) => p.pageNumber === i)
      if (pageData) {
        const width = pageData.width * this.state.zoom
        const height = pageData.height * this.state.zoom
        this.setPageSize(pageEl, width, height)
        this.createPlaceholder(pageEl, width, height)
      } else {
        // Default A4-ish placeholder
        this.setPageSize(pageEl, 595 * this.state.zoom, 842 * this.state.zoom)
        this.createPlaceholder(pageEl, 595 * this.state.zoom, 842 * this.state.zoom)
      }

      this.pageElements.push(pageEl)
      this.pagesContainer.appendChild(pageEl)
    }

    loadingEl.remove()

    // Intersection observer for lazy image loading
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const pageNum = parseInt((entry.target as HTMLElement).dataset.page!, 10)
            this.loadPage(pageNum)
          }
        }
      },
      { root: viewport, rootMargin: '100% 0px' },
    )

    for (const pageEl of this.pageElements) {
      this.observer.observe(pageEl)
    }

    // Scroll tracking
    this.debouncedScroll = debounce(() => this.updateCurrentPage(), 100)
    viewport.addEventListener('scroll', this.debouncedScroll)

    this.setReady({
      format: 'pages',
      pageCount: totalPages,
    })

    if (options.initialPage && options.initialPage > 1) {
      this.goToPage(options.initialPage)
    }
  }

  private setPageSize(pageEl: HTMLElement, width: number, height: number): void {
    pageEl.style.width = `${width}px`
    pageEl.style.height = `${height}px`
  }

  private createPlaceholder(pageEl: HTMLElement, width: number, height: number): void {
    const placeholder = el('div', 'dv-browse-page-placeholder')
    placeholder.style.width = `${width}px`
    placeholder.style.height = `${height}px`
    placeholder.textContent = pageEl.dataset.page || ''
    pageEl.appendChild(placeholder)
  }

  private async loadPage(pageNum: number): Promise<void> {
    if (this.loadedPages.has(pageNum)) return
    this.loadedPages.add(pageNum)

    const pageEl = this.pageElements[pageNum - 1]
    if (!pageEl) return

    try {
      // Get page data
      let pageData: PageData | undefined
      if (this.fetchAdapter) {
        pageData = await this.fetchAdapter.fetchPage(pageNum)
      } else {
        pageData = this.pages.find((p) => p.pageNumber === pageNum)
      }

      if (!pageData) {
        this.loadedPages.delete(pageNum)
        return
      }

      // Create image
      const img = document.createElement('img')
      img.alt = `Page ${pageNum}`
      img.loading = 'lazy'
      img.draggable = false

      if (pageData.imageUrl) {
        img.src = pageData.imageUrl
      } else if (pageData.imageBlob) {
        img.src = URL.createObjectURL(pageData.imageBlob)
        img.addEventListener('load', () => URL.revokeObjectURL(img.src), { once: true })
      }

      const width = pageData.width * this.state.zoom
      const height = pageData.height * this.state.zoom
      img.style.width = `${width}px`
      img.style.height = `${height}px`

      this.setPageSize(pageEl, width, height)
      pageEl.innerHTML = ''
      pageEl.appendChild(img)

      // Text layer overlay
      await this.addTextLayer(pageEl, pageNum, pageData)
    } catch {
      this.loadedPages.delete(pageNum)
    }
  }

  private async addTextLayer(
    pageEl: HTMLElement,
    pageNum: number,
    pageData: PageData,
  ): Promise<void> {
    let textLayerData: TextLayerData | undefined

    if (this.textData) {
      textLayerData = this.textData.find((t) => t.pageNumber === pageNum)
    } else if (this.textFetcher) {
      try {
        textLayerData = await this.textFetcher.fetchPageText(pageNum)
      } catch {
        return
      }
    }

    if (!textLayerData?.items.length) return

    const layer = el('div', 'dv-text-layer')
    for (const item of textLayerData.items) {
      const span = document.createElement('span')
      span.textContent = item.str
      span.style.left = `${item.x * 100}%`
      span.style.top = `${item.y * 100}%`
      span.style.width = `${item.width * 100}%`
      span.style.height = `${item.height * 100}%`
      if (item.fontSize) {
        span.style.fontSize = `${item.fontSize * this.state.zoom}px`
      }
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
    this.state.zoom = clamp(zoom, 0.25, 5)
    // Re-render loaded pages at new size
    for (let i = 0; i < this.pageElements.length; i++) {
      const pageEl = this.pageElements[i]
      const pageData = this.pages[i]
      if (pageData) {
        const w = pageData.width * this.state.zoom
        const h = pageData.height * this.state.zoom
        this.setPageSize(pageEl, w, h)
        const img = pageEl.querySelector('img')
        if (img) {
          img.style.width = `${w}px`
          img.style.height = `${h}px`
        }
      }
    }
  }

  protected onDestroy(): void {
    this.observer?.disconnect()
    this.debouncedScroll?.cancel()
    this.fetchAdapter?.dispose?.()
    this.textFetcher?.dispose?.()
    this.pageElements = []
    this.pages = []
    this.loadedPages.clear()
  }
}

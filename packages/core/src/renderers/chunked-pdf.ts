import type {
  DocViewOptions,
  DocumentFormat,
  ChunkedSource,
  ChunkData,
  ChunkFetchAdapter,
  PageFetchAdapter,
} from '../types.js'
import { DocViewError } from '../types.js'
import { BaseRenderer } from '../renderer.js'
import { el, clamp, debounce, requirePeerDep, toArrayBuffer } from '../utils.js'

/**
 * Streams a large PDF by loading independent PDF chunks on demand.
 * Optionally displays pre-rendered browse page images as fast placeholders
 * while the full-fidelity PDF chunks load in the background.
 *
 * Flow:
 * 1. Show browse page images immediately (if available)
 * 2. When user views a page range, fetch the PDF chunk covering those pages
 * 3. Replace the browse image with the pdf.js-rendered canvas
 * 4. Prefetch adjacent chunks in the background
 */
export class ChunkedPdfRenderer extends BaseRenderer {
  readonly format: DocumentFormat = 'chunked-pdf'

  private pagesContainer!: HTMLElement
  private pageElements: HTMLElement[] = []
  private totalPages = 0

  // Chunk management
  private chunks: ChunkData[] = []
  private chunkAdapter: ChunkFetchAdapter | null = null
  private loadedChunks = new Set<number>()
  private loadingChunks = new Set<number>()

  // Browse page fallback
  private browseAdapter: PageFetchAdapter | null = null
  private browsePages: Map<number, string> = new Map() // pageNum -> objectURL

  private observer: IntersectionObserver | null = null
  private debouncedScroll: ReturnType<typeof debounce> | null = null
  private pdfjsLib: unknown = null

  protected async onMount(viewport: HTMLElement, options: DocViewOptions): Promise<void> {
    const loadingEl = this.showLoading('Loading document…')

    const source = options.source as ChunkedSource
    this.totalPages = source.totalPages

    // Resolve chunk source
    if (Array.isArray(source.chunks)) {
      this.chunks = source.chunks.sort((a, b) => a.pageStart - b.pageStart)
    } else {
      this.chunkAdapter = source.chunks
    }

    // Resolve browse pages (optional fast fallback)
    if (source.browsePages && !Array.isArray(source.browsePages)) {
      this.browseAdapter = source.browsePages
    }

    // Try to load pdfjs for chunk rendering
    try {
      this.pdfjsLib = await requirePeerDep('pdfjs-dist', 'PDF')
    } catch {
      // If pdfjs not available, we can still show browse pages
      if (!this.browseAdapter && !source.browsePages) {
        throw new DocViewError(
          'PEER_DEPENDENCY_MISSING',
          'Chunked PDF rendering requires pdfjs-dist. Install it with: npm install pdfjs-dist',
        )
      }
    }

    // Create pages container
    this.pagesContainer = el('div', 'dv-pages')
    viewport.appendChild(this.pagesContainer)

    // Create page placeholders
    for (let i = 1; i <= this.totalPages; i++) {
      const pageEl = el('div', 'dv-page dv-browse-page')
      pageEl.dataset.page = String(i)
      // Default A4 placeholder
      const w = 595 * this.state.zoom
      const h = 842 * this.state.zoom
      pageEl.style.width = `${w}px`
      pageEl.style.height = `${h}px`

      const placeholder = el('div', 'dv-browse-page-placeholder')
      placeholder.style.width = `${w}px`
      placeholder.style.height = `${h}px`
      placeholder.textContent = String(i)
      pageEl.appendChild(placeholder)

      this.pageElements.push(pageEl)
      this.pagesContainer.appendChild(pageEl)
    }

    loadingEl.remove()

    // Lazy loading via intersection observer
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const pageNum = parseInt((entry.target as HTMLElement).dataset.page!, 10)
            this.loadPageContent(pageNum)
          }
        }
      },
      { root: viewport, rootMargin: '150% 0px' },
    )

    for (const pageEl of this.pageElements) {
      this.observer.observe(pageEl)
    }

    // Scroll tracking
    this.debouncedScroll = debounce(() => this.updateCurrentPage(), 100)
    viewport.addEventListener('scroll', this.debouncedScroll)

    this.setReady({
      format: 'chunked-pdf',
      pageCount: this.totalPages,
    })

    if (options.initialPage && options.initialPage > 1) {
      this.goToPage(options.initialPage)
    }
  }

  /**
   * Load content for a page. Strategy:
   * 1. Show browse page image immediately (fast)
   * 2. Load the PDF chunk in background (slow, high quality)
   * 3. Replace image with PDF canvas when chunk is ready
   */
  private async loadPageContent(pageNum: number): Promise<void> {
    // Step 1: Show browse page quickly
    if (this.browseAdapter && !this.browsePages.has(pageNum)) {
      try {
        const pageData = await this.browseAdapter.fetchPage(pageNum)
        const pageEl = this.pageElements[pageNum - 1]
        if (pageEl && pageData) {
          const img = document.createElement('img')
          img.alt = `Page ${pageNum}`
          img.draggable = false

          if (pageData.imageUrl) {
            img.src = pageData.imageUrl
          } else if (pageData.imageBlob) {
            const url = URL.createObjectURL(pageData.imageBlob)
            img.src = url
            this.browsePages.set(pageNum, url)
          }

          const w = pageData.width * this.state.zoom
          const h = pageData.height * this.state.zoom
          img.style.width = `${w}px`
          img.style.height = `${h}px`
          pageEl.style.width = `${w}px`
          pageEl.style.height = `${h}px`
          pageEl.innerHTML = ''
          pageEl.appendChild(img)
        }
      } catch {
        // Browse page load failed — non-fatal, will try PDF chunk
      }
    }

    // Step 2: Load PDF chunk for this page (if pdfjs available)
    if (this.pdfjsLib) {
      const chunkIndex = this.getChunkIndexForPage(pageNum)
      if (chunkIndex >= 0 && !this.loadedChunks.has(chunkIndex) && !this.loadingChunks.has(chunkIndex)) {
        this.loadingChunks.add(chunkIndex)
        try {
          await this.loadAndRenderChunk(chunkIndex)
          this.loadedChunks.add(chunkIndex)
        } catch {
          // Chunk load failed — browse images remain as fallback
        } finally {
          this.loadingChunks.delete(chunkIndex)
        }
      }
    }
  }

  private getChunkIndexForPage(pageNum: number): number {
    if (this.chunkAdapter) {
      return this.chunkAdapter.getChunkIndexForPage(pageNum)
    }
    return this.chunks.findIndex(
      (c) => pageNum >= c.pageStart && pageNum <= c.pageEnd,
    )
  }

  private async loadAndRenderChunk(chunkIndex: number): Promise<void> {
    let chunkData: ChunkData
    if (this.chunkAdapter) {
      chunkData = await this.chunkAdapter.fetchChunk(chunkIndex)
    } else {
      chunkData = this.chunks[chunkIndex]
    }
    if (!chunkData) return

    const pdfjsLib = this.pdfjsLib as {
      getDocument(params: { data: ArrayBuffer }): { promise: Promise<{
        numPages: number
        getPage(n: number): Promise<{
          getViewport(p: { scale: number }): { width: number; height: number }
          render(p: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }): { promise: Promise<void> }
          cleanup(): void
        }>
        destroy(): void
      }> }
    }

    const data = await toArrayBuffer(chunkData.data instanceof Blob ? chunkData.data : chunkData.data)
    const pdf = await pdfjsLib.getDocument({ data }).promise

    // Render each page in the chunk
    for (let localPage = 1; localPage <= pdf.numPages; localPage++) {
      const globalPage = chunkData.pageStart + localPage - 1
      if (globalPage > this.totalPages) break

      const page = await pdf.getPage(localPage)
      const viewport = page.getViewport({ scale: this.state.zoom })
      const pageEl = this.pageElements[globalPage - 1]
      if (!pageEl) continue

      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')!
      const dpr = window.devicePixelRatio || 1
      canvas.width = viewport.width * dpr
      canvas.height = viewport.height * dpr
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`
      ctx.scale(dpr, dpr)

      await page.render({ canvasContext: ctx, viewport }).promise
      page.cleanup()

      // Replace browse image with canvas
      pageEl.style.width = `${viewport.width}px`
      pageEl.style.height = `${viewport.height}px`
      pageEl.innerHTML = ''
      pageEl.appendChild(canvas)

      // Revoke browse page object URL if we had one
      const browseUrl = this.browsePages.get(globalPage)
      if (browseUrl) {
        URL.revokeObjectURL(browseUrl)
        this.browsePages.delete(globalPage)
      }
    }

    pdf.destroy()
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
    // Would need to re-render — simplified: just rescale existing elements
    for (const pageEl of this.pageElements) {
      const canvas = pageEl.querySelector('canvas')
      const img = pageEl.querySelector('img')
      if (canvas || img) {
        // For a full implementation, re-render at new scale
        // For now, CSS transform as fast approximation
        pageEl.style.transform = ''
      }
    }
  }

  protected onDestroy(): void {
    this.observer?.disconnect()
    this.debouncedScroll?.cancel()
    this.chunkAdapter?.dispose?.()
    this.browseAdapter?.dispose?.()
    // Revoke all object URLs
    for (const url of this.browsePages.values()) {
      URL.revokeObjectURL(url)
    }
    this.browsePages.clear()
    this.pageElements = []
    this.chunks = []
    this.loadedChunks.clear()
    this.loadingChunks.clear()
  }
}

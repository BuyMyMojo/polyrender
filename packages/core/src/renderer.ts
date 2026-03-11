import type {
  Renderer,
  DocViewOptions,
  DocumentFormat,
  DocumentInfo,
  DocViewState,
} from './types.js'
import { DocViewError } from './types.js'
import { el, clearElement } from './utils.js'

/**
 * Abstract base class for format renderers. Provides common state management,
 * DOM scaffolding, and helper methods. Concrete renderers extend this and
 * implement the abstract methods.
 *
 * Subclasses must implement:
 * - `onMount(viewport, options)` — render content into the viewport element
 * - `onDestroy()` — clean up format-specific resources
 * - `format` getter
 */
export abstract class BaseRenderer implements Renderer {
  abstract readonly format: DocumentFormat

  protected container!: HTMLElement
  protected viewport!: HTMLElement
  protected options!: DocViewOptions
  protected state: DocViewState = {
    loading: true,
    error: null,
    currentPage: 1,
    totalPages: 1,
    zoom: 1,
    documentInfo: null,
  }

  async mount(container: HTMLElement, options: DocViewOptions): Promise<void> {
    this.container = container
    this.options = options
    this.state.currentPage = options.initialPage ?? 1

    // Create viewport element
    this.viewport = el('div', 'dv-viewport')
    this.viewport.setAttribute('role', 'document')
    container.appendChild(this.viewport)

    // Delegate to subclass
    try {
      await this.onMount(this.viewport, options)
    } catch (err) {
      const error = err instanceof DocViewError
        ? err
        : new DocViewError('RENDER_FAILED', String(err), err)
      this.state.error = error
      this.state.loading = false
      this.showError(error)
      throw error
    }
  }

  async update(changed: Partial<DocViewOptions>): Promise<void> {
    Object.assign(this.options, changed)
    await this.onUpdate(changed)
  }

  goToPage(page: number): void {
    const clamped = Math.max(1, Math.min(page, this.state.totalPages))
    if (clamped === this.state.currentPage) return
    this.state.currentPage = clamped
    this.onPageChange(clamped)
    this.options.onPageChange?.(clamped, this.state.totalPages)
  }

  getPageCount(): number {
    return this.state.totalPages
  }

  getCurrentPage(): number {
    return this.state.currentPage
  }

  setZoom(zoom: number | 'fit-width' | 'fit-page'): void {
    const resolved = typeof zoom === 'number'
      ? zoom
      : this.resolveZoomMode(zoom)
    this.state.zoom = resolved
    this.onZoomChange(resolved)
    this.options.onZoomChange?.(resolved)
  }

  getZoom(): number {
    return this.state.zoom
  }

  destroy(): void {
    this.onDestroy()
    clearElement(this.container)
  }

  // --- Subclass hooks ---

  /** Render the document into the viewport. */
  protected abstract onMount(viewport: HTMLElement, options: DocViewOptions): Promise<void>

  /** Clean up format-specific resources. */
  protected abstract onDestroy(): void

  /** React to option changes. Default: no-op. */
  protected async onUpdate(_changed: Partial<DocViewOptions>): Promise<void> {}

  /** Navigate to a page in the rendered content. Default: no-op. */
  protected onPageChange(_page: number): void {}

  /** Apply a zoom change. Default: no-op. */
  protected onZoomChange(_zoom: number): void {}

  // --- Helpers available to subclasses ---

  /** Resolve 'fit-width' or 'fit-page' to a numeric scale based on viewport size. */
  protected resolveZoomMode(_mode: 'fit-width' | 'fit-page'): number {
    // Default implementation — subclasses with page dimensions override this
    return 1
  }

  /** Show a loading spinner in the viewport. */
  protected showLoading(message = 'Loading document…'): HTMLElement {
    const loading = el('div', 'dv-loading')
    loading.innerHTML = `<div class="dv-spinner"></div><span>${message}</span>`
    this.viewport.appendChild(loading)
    this.state.loading = true
    this.options.onLoadingChange?.(true)
    return loading
  }

  /** Remove loading state. */
  protected hideLoading(): void {
    const loading = this.viewport.querySelector('.dv-loading')
    if (loading) loading.remove()
    this.state.loading = false
    this.options.onLoadingChange?.(false)
  }

  /** Show an error message in the viewport. */
  protected showError(error: DocViewError): void {
    clearElement(this.viewport)
    const errorEl = el('div', 'dv-error')
    errorEl.innerHTML = `
      <div class="dv-error-code">${error.code}</div>
      <div class="dv-error-message">${error.message}</div>
    `
    this.viewport.appendChild(errorEl)
  }

  /** Mark the document as ready and fire the onReady callback. */
  protected setReady(info: DocumentInfo): void {
    this.state.documentInfo = info
    this.state.totalPages = info.pageCount
    this.state.loading = false
    this.hideLoading()
    this.options.onReady?.(info)
    this.options.onLoadingChange?.(false)
  }

  /** Fire page change callback (call after updating state.currentPage). */
  protected emitPageChange(): void {
    this.options.onPageChange?.(this.state.currentPage, this.state.totalPages)
  }
}

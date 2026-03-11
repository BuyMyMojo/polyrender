import type {
  DocViewOptions,
  DocViewState,
  DocumentFormat,
  Renderer,
  RendererFactory,
  DocViewEventMap,
  DocViewEventType,
  ToolbarConfig,
} from './types.js'
import { DocViewError } from './types.js'
import { registry } from './registry.js'
import { detectFormat, getRendererFormat, clearElement } from './utils.js'
import { createToolbar, type ToolbarHandle } from './toolbar.js'
import { registerBuiltinRenderers } from './renderers/index.js'

// Register built-in renderers on first import
let registered = false
function ensureRegistered() {
  if (!registered) {
    registerBuiltinRenderers()
    registered = true
  }
}

/**
 * DocView — Universal Document Viewer
 *
 * Framework-agnostic entry point. Creates a document viewer inside a container
 * element, auto-detecting the format and loading the appropriate renderer.
 *
 * @example
 * ```ts
 * import { DocView } from '@docview/core'
 * import '@docview/core/styles.css'
 *
 * const viewer = new DocView(document.getElementById('viewer')!, {
 *   source: { type: 'url', url: '/document.pdf' },
 *   theme: 'dark',
 *   onReady: (info) => console.log('Loaded:', info.pageCount, 'pages'),
 * })
 *
 * // Navigate
 * viewer.goToPage(5)
 *
 * // Clean up
 * viewer.destroy()
 * ```
 */
export class DocView {
  private container: HTMLElement
  private options: DocViewOptions
  private renderer: Renderer | null = null
  private toolbar: ToolbarHandle | null = null
  private root: HTMLElement
  private listeners = new Map<string, Set<(data: unknown) => void>>()
  private destroyed = false

  constructor(container: HTMLElement, options: DocViewOptions) {
    ensureRegistered()

    this.container = container
    this.options = { ...options }

    // Create root element
    this.root = document.createElement('div')
    this.root.className = `docview${options.className ? ` ${options.className}` : ''}`
    this.root.setAttribute('data-theme', this.resolveTheme(options.theme))
    container.appendChild(this.root)

    // Initialize asynchronously
    this.init().catch((err) => {
      const error = err instanceof DocViewError
        ? err
        : new DocViewError('UNKNOWN', String(err), err)
      options.onError?.(error)
      this.emit('error', error)
    })
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Navigate to a specific page (1-indexed). */
  goToPage(page: number): void {
    this.renderer?.goToPage(page)
    this.updateToolbar()
  }

  /** Get the current page number. */
  getCurrentPage(): number {
    return this.renderer?.getCurrentPage() ?? 1
  }

  /** Get the total page count. */
  getPageCount(): number {
    return this.renderer?.getPageCount() ?? 0
  }

  /** Set zoom level. */
  setZoom(zoom: number | 'fit-width' | 'fit-page'): void {
    this.renderer?.setZoom(zoom)
    this.updateToolbar()
  }

  /** Get current zoom as a numeric scale. */
  getZoom(): number {
    return this.renderer?.getZoom() ?? 1
  }

  /** Get current viewer state. */
  getState(): DocViewState {
    if (!this.renderer) {
      return {
        loading: true,
        error: null,
        currentPage: 1,
        totalPages: 0,
        zoom: 1,
        documentInfo: null,
      }
    }
    return {
      loading: false,
      error: null,
      currentPage: this.renderer.getCurrentPage(),
      totalPages: this.renderer.getPageCount(),
      zoom: this.renderer.getZoom(),
      documentInfo: null, // Would need to store from onReady
    }
  }

  /** Update options (theme, zoom, etc.) without re-mounting. */
  async update(changed: Partial<DocViewOptions>): Promise<void> {
    Object.assign(this.options, changed)

    if (changed.theme) {
      this.root.setAttribute('data-theme', this.resolveTheme(changed.theme))
    }
    if (changed.className !== undefined) {
      this.root.className = `docview${changed.className ? ` ${changed.className}` : ''}`
    }

    await this.renderer?.update(changed)
  }

  /** Subscribe to events. Returns an unsubscribe function. */
  on<K extends DocViewEventType>(
    event: K,
    callback: (data: DocViewEventMap[K]) => void,
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    const cb = callback as (data: unknown) => void
    this.listeners.get(event)!.add(cb)
    return () => this.listeners.get(event)?.delete(cb)
  }

  /** Destroy the viewer and clean up all resources. */
  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true

    this.toolbar?.destroy()
    this.renderer?.destroy()
    this.root.remove()
    this.listeners.clear()
    this.emit('destroy', undefined as never)
  }

  /** Register a custom renderer for a format. */
  static registerRenderer(format: DocumentFormat, factory: RendererFactory): void {
    ensureRegistered()
    registry.register(format, factory)
  }

  /** Get all registered format names. */
  static getFormats(): DocumentFormat[] {
    ensureRegistered()
    return registry.formats()
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private async init(): Promise<void> {
    // Detect format
    const explicitFormat = this.options.format
    const detectedFormat = detectFormat(this.options.source)
    const format = explicitFormat ?? detectedFormat

    if (!format) {
      throw new DocViewError(
        'FORMAT_DETECTION_FAILED',
        'Could not detect the document format. Provide a `format` option or ensure ' +
        'the source has a recognizable filename, URL extension, or MIME type.',
      )
    }

    // Resolve renderer format (e.g., 'markdown' -> 'code', 'tsv' -> 'csv')
    const rendererFormat = getRendererFormat(format)

    // Create renderer
    const renderer = registry.create(rendererFormat)
    if (!renderer) {
      throw new DocViewError(
        'FORMAT_UNSUPPORTED',
        `No renderer registered for format "${rendererFormat}". ` +
        `Available formats: ${registry.formats().join(', ')}`,
      )
    }

    this.renderer = renderer

    // Wire up options callbacks to also emit events
    const originalOnReady = this.options.onReady
    this.options.onReady = (info) => {
      originalOnReady?.(info)
      this.emit('ready', info)
      this.updateToolbar()
    }

    const originalOnPageChange = this.options.onPageChange
    this.options.onPageChange = (page, total) => {
      originalOnPageChange?.(page, total)
      this.emit('pagechange', { page, totalPages: total })
      this.updateToolbar()
    }

    const originalOnZoomChange = this.options.onZoomChange
    this.options.onZoomChange = (zoom) => {
      originalOnZoomChange?.(zoom)
      this.emit('zoomchange', { zoom })
      this.updateToolbar()
    }

    const originalOnError = this.options.onError
    this.options.onError = (err) => {
      originalOnError?.(err)
      this.emit('error', err)
    }

    // Create toolbar (before renderer mount, so it appears above the viewport)
    const toolbarOpt = this.options.toolbar
    if (toolbarOpt !== false) {
      const config: ToolbarConfig = toolbarOpt === true || toolbarOpt === undefined
        ? {} // Default config
        : toolbarOpt

      this.toolbar = createToolbar(config, {
        onPrevPage: () => this.goToPage(this.getCurrentPage() - 1),
        onNextPage: () => this.goToPage(this.getCurrentPage() + 1),
        onPageInput: (p) => this.goToPage(p),
        onZoomIn: () => this.setZoom(this.getZoom() * 1.2),
        onZoomOut: () => this.setZoom(this.getZoom() / 1.2),
        onFitWidth: () => this.setZoom('fit-width'),
        onFullscreen: () => this.toggleFullscreen(),
      }, this.getState())

      if (config.position === 'bottom') {
        this.root.appendChild(this.toolbar.element)
      } else {
        this.root.insertBefore(this.toolbar.element, this.root.firstChild)
      }
    }

    // Create renderer container
    const rendererContainer = document.createElement('div')
    rendererContainer.style.display = 'contents'
    this.root.appendChild(rendererContainer)

    // Mount renderer
    await renderer.mount(rendererContainer, this.options)
  }

  private resolveTheme(theme?: 'light' | 'dark' | 'system'): string {
    if (theme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
    }
    return theme ?? 'dark'
  }

  private updateToolbar(): void {
    this.toolbar?.updateState(this.getState())
  }

  private toggleFullscreen(): void {
    if (document.fullscreenElement === this.root) {
      document.exitFullscreen()
    } else {
      this.root.requestFullscreen?.()
    }
  }

  private emit<K extends DocViewEventType>(event: K, data: DocViewEventMap[K]): void {
    const callbacks = this.listeners.get(event)
    if (callbacks) {
      for (const cb of callbacks) {
        try { cb(data) } catch { /* swallow listener errors */ }
      }
    }
  }
}

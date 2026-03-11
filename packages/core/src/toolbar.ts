import type { ToolbarConfig, PolyRenderState } from './types.js'
import { el, svgIcon, icons } from './utils.js'

export interface ToolbarActions {
  onPrevPage(): void
  onNextPage(): void
  onPageInput(page: number): void
  onZoomIn(): void
  onZoomOut(): void
  onFitWidth(): void
  onFullscreen(): void
  onDownload?(): void
}

export interface ToolbarHandle {
  /** Root toolbar element. */
  element: HTMLElement
  /** Update displayed state (page, total, zoom). */
  updateState(state: PolyRenderState): void
  /** Destroy and clean up listeners. */
  destroy(): void
}

/**
 * Build a toolbar DOM element wired to the provided actions.
 * Returns a handle for updating state and destroying.
 */
export function createToolbar(
  config: ToolbarConfig,
  actions: ToolbarActions,
  initialState: PolyRenderState,
): ToolbarHandle {
  const toolbar = el('div', 'dv-toolbar')
  if (config.position === 'bottom') {
    toolbar.setAttribute('data-position', 'bottom')
  }

  let pageInput: HTMLInputElement | null = null
  let pageLabel: HTMLSpanElement | null = null
  let zoomLabel: HTMLSpanElement | null = null
  let prevBtn: HTMLButtonElement | null = null
  let nextBtn: HTMLButtonElement | null = null

  // --- Navigation group ---
  if (config.navigation !== false) {
    const navGroup = el('div', 'dv-toolbar-group')

    prevBtn = el('button', 'dv-toolbar-btn')
    prevBtn.title = 'Previous page'
    prevBtn.appendChild(svgIcon(icons.chevronLeft))
    prevBtn.addEventListener('click', actions.onPrevPage)

    pageInput = el('input', 'dv-page-input') as HTMLInputElement
    pageInput.type = 'text'
    pageInput.inputMode = 'numeric'
    pageInput.value = String(initialState.currentPage)
    pageInput.title = 'Go to page'
    pageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = parseInt(pageInput!.value, 10)
        if (!isNaN(val)) actions.onPageInput(val)
      }
    })
    pageInput.addEventListener('blur', () => {
      pageInput!.value = String(initialState.currentPage)
    })

    pageLabel = el('span', 'dv-toolbar-label')
    pageLabel.textContent = `/ ${initialState.totalPages}`

    nextBtn = el('button', 'dv-toolbar-btn')
    nextBtn.title = 'Next page'
    nextBtn.appendChild(svgIcon(icons.chevronRight))
    nextBtn.addEventListener('click', actions.onNextPage)

    navGroup.append(prevBtn, pageInput, pageLabel, nextBtn)
    toolbar.appendChild(navGroup)
  }

  // --- Info (filename/format) ---
  if (config.info !== false && initialState.documentInfo?.filename) {
    const sep = el('div', 'dv-toolbar-separator')
    const infoLabel = el('span', 'dv-toolbar-label')
    infoLabel.textContent = initialState.documentInfo.filename
    infoLabel.title = initialState.documentInfo.filename
    toolbar.append(sep, infoLabel)
  }

  // Spacer
  toolbar.appendChild(el('div', 'dv-toolbar-spacer'))

  // --- Zoom group ---
  if (config.zoom !== false) {
    const zoomGroup = el('div', 'dv-toolbar-group')

    const zoomOutBtn = el('button', 'dv-toolbar-btn')
    zoomOutBtn.title = 'Zoom out'
    zoomOutBtn.appendChild(svgIcon(icons.zoomOut))
    zoomOutBtn.addEventListener('click', actions.onZoomOut)

    zoomLabel = el('span', 'dv-toolbar-label')
    zoomLabel.textContent = `${Math.round(initialState.zoom * 100)}%`

    const zoomInBtn = el('button', 'dv-toolbar-btn')
    zoomInBtn.title = 'Zoom in'
    zoomInBtn.appendChild(svgIcon(icons.zoomIn))
    zoomInBtn.addEventListener('click', actions.onZoomIn)

    const fitWidthBtn = el('button', 'dv-toolbar-btn')
    fitWidthBtn.title = 'Fit width'
    fitWidthBtn.appendChild(svgIcon(icons.fitWidth))
    fitWidthBtn.addEventListener('click', actions.onFitWidth)

    zoomGroup.append(zoomOutBtn, zoomLabel, zoomInBtn, fitWidthBtn)
    toolbar.appendChild(zoomGroup)
  }

  // --- Fullscreen ---
  if (config.fullscreen !== false) {
    const sep = el('div', 'dv-toolbar-separator')
    const fsBtn = el('button', 'dv-toolbar-btn')
    fsBtn.title = 'Toggle fullscreen'
    fsBtn.appendChild(svgIcon(icons.fullscreen))
    fsBtn.addEventListener('click', actions.onFullscreen)
    toolbar.append(sep, fsBtn)
  }

  // --- Download ---
  if (config.download && actions.onDownload) {
    const dlBtn = el('button', 'dv-toolbar-btn')
    dlBtn.title = 'Download'
    dlBtn.appendChild(svgIcon(icons.download))
    dlBtn.addEventListener('click', actions.onDownload)
    toolbar.appendChild(dlBtn)
  }

  return {
    element: toolbar,
    updateState(state: PolyRenderState) {
      if (pageInput) pageInput.value = String(state.currentPage)
      if (pageLabel) pageLabel.textContent = `/ ${state.totalPages}`
      if (zoomLabel) zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`
      if (prevBtn) prevBtn.disabled = state.currentPage <= 1
      if (nextBtn) nextBtn.disabled = state.currentPage >= state.totalPages
    },
    destroy() {
      toolbar.remove()
    },
  }
}

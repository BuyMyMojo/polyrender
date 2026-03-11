import { useRef, useEffect, useState, useCallback } from 'react'
import type {
  PolyRenderOptions,
  PolyRenderState,
  DocumentInfo,
  PolyRenderError,
  DocumentSource,
} from '@polyrender/core'
import { PolyRender } from '@polyrender/core'

export interface UseDocumentRendererOptions
  extends Omit<PolyRenderOptions, 'source' | 'onReady' | 'onPageChange' | 'onZoomChange' | 'onError' | 'onLoadingChange'> {
  source: DocumentSource | null | undefined
  onReady?: (info: DocumentInfo) => void
  onPageChange?: (page: number, totalPages: number) => void
  onZoomChange?: (zoom: number) => void
  onError?: (error: PolyRenderError) => void
  onLoadingChange?: (loading: boolean) => void
}

export interface UseDocumentRendererReturn {
  /** Ref to attach to the container div. */
  containerRef: React.RefObject<HTMLDivElement | null>
  /** Current viewer state. */
  state: PolyRenderState
  /** Navigate to a page. */
  goToPage: (page: number) => void
  /** Set zoom level. */
  setZoom: (zoom: number | 'fit-width' | 'fit-page') => void
  /** Whether the viewer is mounted and ready. */
  ready: boolean
  /** Current error, if any. */
  error: PolyRenderError | null
}

/**
 * React hook for the PolyRender document renderer.
 *
 * Manages the lifecycle of a PolyRender instance, bridging its imperative API
 * to React's declarative model. Handles mounting, updating, and cleanup.
 *
 * @example
 * ```tsx
 * function MyViewer({ url }: { url: string }) {
 *   const { containerRef, state, goToPage } = useDocumentRenderer({
 *     source: { type: 'url', url },
 *     theme: 'dark',
 *   })
 *
 *   return (
 *     <div>
 *       <div ref={containerRef} style={{ width: '100%', height: '600px' }} />
 *       <p>Page {state.currentPage} of {state.totalPages}</p>
 *     </div>
 *   )
 * }
 * ```
 */
export function useDocumentRenderer(
  options: UseDocumentRendererOptions,
): UseDocumentRendererReturn {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const instanceRef = useRef<PolyRender | null>(null)
  const optionsRef = useRef(options)

  const [state, setState] = useState<PolyRenderState>({
    loading: true,
    error: null,
    currentPage: 1,
    totalPages: 0,
    zoom: 1,
    documentInfo: null,
  })

  const [ready, setReady] = useState(false)
  const [error, setError] = useState<PolyRenderError | null>(null)

  // Keep options ref current
  optionsRef.current = options

  // Mount / unmount effect
  useEffect(() => {
    const container = containerRef.current
    if (!container || !options.source) return

    // Clear any previous instance
    if (instanceRef.current) {
      instanceRef.current.destroy()
      instanceRef.current = null
    }

    setReady(false)
    setError(null)
    setState((s) => ({ ...s, loading: true, error: null }))

    const instance = new PolyRender(container, {
      ...options,
      source: options.source,
      onReady: (info) => {
        setReady(true)
        setState((s) => ({
          ...s,
          loading: false,
          totalPages: info.pageCount,
          documentInfo: info,
        }))
        optionsRef.current.onReady?.(info)
      },
      onPageChange: (page, totalPages) => {
        setState((s) => ({ ...s, currentPage: page, totalPages }))
        optionsRef.current.onPageChange?.(page, totalPages)
      },
      onZoomChange: (zoom) => {
        setState((s) => ({ ...s, zoom }))
        optionsRef.current.onZoomChange?.(zoom)
      },
      onError: (err) => {
        setError(err)
        setState((s) => ({ ...s, loading: false, error: err }))
        optionsRef.current.onError?.(err)
      },
      onLoadingChange: (loading) => {
        setState((s) => ({ ...s, loading }))
        optionsRef.current.onLoadingChange?.(loading)
      },
    })

    instanceRef.current = instance

    return () => {
      instance.destroy()
      instanceRef.current = null
    }
    // Re-mount when source identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.source, options.format, options.theme])

  // Update non-source options without re-mounting
  useEffect(() => {
    if (!instanceRef.current) return

    const changed: Partial<PolyRenderOptions> = {}
    if (options.theme) changed.theme = options.theme
    if (options.className !== undefined) changed.className = options.className
    if (options.zoom !== undefined) changed.zoom = options.zoom

    if (Object.keys(changed).length > 0) {
      instanceRef.current.update(changed)
    }
  }, [options.theme, options.className, options.zoom])

  const goToPage = useCallback((page: number) => {
    instanceRef.current?.goToPage(page)
  }, [])

  const setZoom = useCallback((zoom: number | 'fit-width' | 'fit-page') => {
    instanceRef.current?.setZoom(zoom)
  }, [])

  return {
    containerRef,
    state,
    goToPage,
    setZoom,
    ready,
    error,
  }
}

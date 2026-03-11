import type { PolyRenderOptions, DocumentFormat } from '../types.js'
import { PolyRenderError } from '../types.js'
import { BaseRenderer } from '../renderer.js'
import { el, clamp, debounce, requirePeerDep, toArrayBuffer, fetchAsBuffer, getExtension } from '../utils.js'

// ---------------------------------------------------------------------------
// Image format constants
// ---------------------------------------------------------------------------

const NATIVE_IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'avif'])

const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
  avif: 'image/avif',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  jxl: 'image/jxl',
}

// ---------------------------------------------------------------------------
// Extracted image type
// ---------------------------------------------------------------------------

interface ExtractedImage {
  name: string
  data: ArrayBuffer
  ext: string
  mimeType: string
}

// ---------------------------------------------------------------------------
// Natural sort (handles numeric runs: "page10" > "page9")
// ---------------------------------------------------------------------------

function naturalCompare(a: string, b: string): number {
  const re = /(\d+)|(\D+)/g
  const chunksA = a.match(re) ?? []
  const chunksB = b.match(re) ?? []
  for (let i = 0; i < Math.max(chunksA.length, chunksB.length); i++) {
    if (i >= chunksA.length) return -1
    if (i >= chunksB.length) return 1
    const ca = chunksA[i], cb = chunksB[i]
    const na = parseInt(ca, 10), nb = parseInt(cb, 10)
    if (!isNaN(na) && !isNaN(nb)) {
      if (na !== nb) return na - nb
    } else {
      const lca = ca.toLowerCase(), lcb = cb.toLowerCase()
      if (lca < lcb) return -1
      if (lca > lcb) return 1
    }
  }
  return 0
}

function fileBasename(path: string): string {
  return path.replace(/\\/g, '/').split('/').pop() ?? path
}

function fileExt(name: string): string {
  return (name.split('.').pop() ?? '').toLowerCase()
}

function isImage(name: string, allowed?: Set<string>): boolean {
  const ext = fileExt(name)
  return (allowed ?? new Set([...NATIVE_IMAGE_EXTS, 'tif', 'tiff', 'jxl'])).has(ext)
}

// ---------------------------------------------------------------------------
// Built-in TAR reader (CBT = uncompressed TAR — no peer dep needed)
// ---------------------------------------------------------------------------

function extractFromTar(data: ArrayBuffer, allowed?: Set<string>): ExtractedImage[] {
  const bytes = new Uint8Array(data)
  const files: ExtractedImage[] = []
  const dec = new TextDecoder()

  const str = (start: number, len: number): string => {
    let end = start
    while (end < start + len && bytes[end] !== 0) end++
    return dec.decode(bytes.slice(start, end)).trim()
  }

  let offset = 0
  while (offset + 512 <= bytes.length) {
    const name = str(offset, 100)
    if (!name) break // two zero blocks = EOF

    const prefix = str(offset + 345, 155)
    const fullName = prefix ? `${prefix}/${name}` : name
    const basename = fileBasename(fullName)

    const sizeStr = str(offset + 124, 12)
    const size = parseInt(sizeStr, 8) || 0
    const typeFlag = String.fromCharCode(bytes[offset + 156])

    offset += 512

    if ((typeFlag === '0' || typeFlag === '\0' || typeFlag === '') && size > 0) {
      if (isImage(basename, allowed)) {
        const ext = fileExt(basename)
        files.push({
          name: basename,
          data: data.slice(offset, offset + size),
          ext,
          mimeType: IMAGE_MIME[ext] ?? 'application/octet-stream',
        })
      }
    }

    offset += Math.ceil(size / 512) * 512
  }

  return files.sort((a, b) => naturalCompare(a.name, b.name))
}

// ---------------------------------------------------------------------------
// Peer-dep type declarations
// ---------------------------------------------------------------------------

// jszip ^3.0.0
interface JSZipEntry { dir: boolean; async(type: 'arraybuffer'): Promise<ArrayBuffer> }
interface JSZipInstance { loadAsync(data: ArrayBuffer): Promise<{ files: Record<string, JSZipEntry> }> }
type JSZipConstructor = new () => JSZipInstance
// requirePeerDep may return the constructor directly (build plugins unwrap .default)
// or the ESM namespace object with a .default property (plain import)
type JSZipModule = JSZipConstructor | { default: JSZipConstructor }

// node-unrar-js ^2.0.0  https://github.com/YuJianrong/node-unrar-js
interface UnrarFileHeader {
  name: string
  flags: { encrypted: boolean; solid: boolean; directory: boolean }
}
interface UnrarArcFile { fileHeader: UnrarFileHeader; extraction?: Uint8Array }
interface UnrarExtractor {
  getFileList(): { arcHeader: unknown; fileHeaders: Generator<UnrarFileHeader> }
  extract(opts?: {
    files?: string[] | ((h: UnrarFileHeader) => boolean)
    password?: string
  }): { arcHeader: unknown; files: Generator<UnrarArcFile> }
}
interface UnrarModule {
  createExtractorFromData(opts: { data: ArrayBuffer; wasmBinary?: ArrayBuffer; password?: string }): Promise<UnrarExtractor>
}

// 7z-wasm ^1.2.0  https://github.com/nicktindall/7z-wasm (npm: 7z-wasm)
// Uses an Emscripten virtual FS: write archive in, call main to extract, read files out.
interface SevenZipNodeAttr { mode: number }
interface SevenZipFS {
  writeFile(path: string, data: ArrayBufferView, opts?: { flags?: string }): void
  mkdir(path: string, mode?: number): unknown
  readdir(path: string): string[]
  readFile(path: string, opts?: { flags?: string }): Uint8Array
  stat(path: string, dontFollow?: boolean): SevenZipNodeAttr
  isFile(mode: number): boolean
  isDir(mode: number): boolean
  unlink(path: string): void
  rmdir(path: string): void
}
interface SevenZipModule {
  default: (opts?: { print?: (s: string) => void; printErr?: (s: string) => void }) => Promise<{
    FS: SevenZipFS
    callMain(args: string[]): void
  }>
}

// utif ^3.1.0  https://github.com/photopea/UTIF.js
interface UtifIfd { width: number; height: number; data: Uint8Array }
interface UtifModule {
  default: {
    decode(buffer: ArrayBuffer): UtifIfd[]
    decodeImage(buffer: ArrayBuffer, ifd: UtifIfd): void
  }
}

// @jsquash/jxl ^1.3.0  https://github.com/jamsinclair/jSquash
interface JxlModule {
  decode(data: ArrayBuffer | Uint8Array): Promise<ImageData>
}

// ---------------------------------------------------------------------------
// ComicRenderer
// ---------------------------------------------------------------------------

export class ComicRenderer extends BaseRenderer {
  readonly format: DocumentFormat = 'comic'

  private pagesContainer!: HTMLElement
  private pageElements: HTMLElement[] = []
  private pages: ExtractedImage[] = []
  private pageDims = new Map<number, { w: number; h: number }>() // 1-indexed
  private blobUrls: string[] = []
  private loadedPages = new Set<number>()
  private observer: IntersectionObserver | null = null
  private debouncedScroll: ReturnType<typeof debounce> | null = null

  private jxlDecoder: JxlModule | null = null
  private utifDecoder: UtifModule | null = null
  private fitMode = false

  protected async onMount(viewport: HTMLElement, options: PolyRenderOptions): Promise<void> {
    const loadingEl = this.showLoading('Loading archive…')
    const comic = options.comic ?? {}

    // -- Resolve source ---------------------------------------------------------
    let data: ArrayBuffer
    let filename: string | undefined

    if (options.source.type === 'file') {
      data = await toArrayBuffer(options.source.data)
      filename = options.source.filename
    } else if (options.source.type === 'url') {
      data = await fetchAsBuffer(options.source.url, options.source.fetchOptions)
      filename = options.source.filename ?? fileBasename(options.source.url)
    } else {
      throw new PolyRenderError('FORMAT_UNSUPPORTED', 'Comic renderer requires a file or URL source.')
    }

    const archiveExt = filename ? getExtension(filename) : ''

    // -- Build allowed image extension set from options -------------------------
    let allowedExts: Set<string> | undefined
    if (comic.imageFormats) {
      allowedExts = new Set<string>()
      for (const fmt of comic.imageFormats) {
        if (fmt === 'jpg') { allowedExts.add('jpg'); allowedExts.add('jpeg') }
        else if (fmt === 'tiff') { allowedExts.add('tiff'); allowedExts.add('tif') }
        else allowedExts.add(fmt)
      }
    }

    // -- Optionally load special-format decoders --------------------------------
    if (comic.jxlFallback) {
      try {
        this.jxlDecoder = await requirePeerDep<JxlModule>('@jsquash/jxl', 'JPEG XL images')
      } catch {
        // Silently continue without JXL support — JXL pages will be skipped
      }
    }
    if (comic.tiffSupport) {
      try {
        this.utifDecoder = await requirePeerDep<UtifModule>('utif', 'TIFF images')
      } catch {
        // Silently continue without TIFF support — TIFF pages will be skipped
      }
    }

    // -- Extract images from archive --------------------------------------------
    const msgEl = loadingEl.querySelector('span')
    if (msgEl) msgEl.textContent = 'Extracting pages…'

    this.pages = await this.extract(data, archiveExt, allowedExts)

    if (this.pages.length === 0) {
      throw new PolyRenderError('RENDER_FAILED', 'No supported image files found in the archive.')
    }

    // -- Build placeholder page elements ----------------------------------------
    this.pagesContainer = el('div', 'dv-pages dv-comic-pages')
    viewport.appendChild(this.pagesContainer)

    const defaultW = 800 * this.state.zoom
    const defaultH = 1200 * this.state.zoom

    for (let i = 0; i < this.pages.length; i++) {
      const pageEl = el('div', 'dv-page dv-browse-page dv-comic-page')
      pageEl.dataset.page = String(i + 1)
      pageEl.style.width = `${defaultW}px`
      pageEl.style.height = `${defaultH}px`

      const placeholder = el('div', 'dv-browse-page-placeholder')
      placeholder.style.width = `${defaultW}px`
      placeholder.style.height = `${defaultH}px`
      placeholder.textContent = String(i + 1)
      pageEl.appendChild(placeholder)

      this.pageElements.push(pageEl)
      this.pagesContainer.appendChild(pageEl)
    }

    loadingEl.remove()

    // -- Intersection observer for lazy image loading ---------------------------
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const p = parseInt((entry.target as HTMLElement).dataset.page!, 10)
            void this.loadPage(p)
          }
        }
      },
      { root: viewport, rootMargin: '150% 0px' },
    )
    for (const pageEl of this.pageElements) this.observer.observe(pageEl)

    // -- Scroll-based current-page tracking ------------------------------------
    this.debouncedScroll = debounce(() => this.updateCurrentPage(), 100)
    viewport.addEventListener('scroll', this.debouncedScroll)

    this.setReady({ format: 'comic', pageCount: this.pages.length, filename })

    if (options.initialPage && options.initialPage > 1) {
      this.goToPage(options.initialPage)
    }
  }

  // ---------------------------------------------------------------------------
  // Archive extraction dispatcher
  // ---------------------------------------------------------------------------

  private async extract(
    data: ArrayBuffer,
    ext: string,
    allowed?: Set<string>,
  ): Promise<ExtractedImage[]> {
    switch (ext) {
      case 'cbz': return this.extractZip(data, allowed)
      case 'cbr': return this.extractRar(data, allowed)
      case 'cb7': return this.extract7z(data, allowed)
      case 'cbt': return extractFromTar(data, allowed)
      case 'cba':
        throw new PolyRenderError(
          'FORMAT_UNSUPPORTED',
          'CBА (ACE) archives are not supported. No browser-compatible ACE decoder is available.',
        )
      default:
        // Unknown extension — try ZIP as a best-effort fallback (CBZ without correct ext)
        return this.extractZip(data, allowed)
    }
  }

  // -- CBZ via jszip -----------------------------------------------------------

  private async extractZip(data: ArrayBuffer, allowed?: Set<string>): Promise<ExtractedImage[]> {
    const mod = await requirePeerDep<JSZipModule>('jszip', 'CBZ comic archives')
    const JSZip = typeof mod === 'function' ? mod : mod.default
    const zip = await new JSZip().loadAsync(data)
    const files: ExtractedImage[] = []

    for (const [path, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue
      const name = fileBasename(path)
      if (!isImage(name, allowed)) continue
      const ext = fileExt(name)
      const buf = await entry.async('arraybuffer')
      files.push({ name, data: buf, ext, mimeType: IMAGE_MIME[ext] ?? 'application/octet-stream' })
    }

    return files.sort((a, b) => naturalCompare(a.name, b.name))
  }

  // -- CBR via node-unrar-js ---------------------------------------------------
  // Peer dep: node-unrar-js ^2.0.0  (npm install node-unrar-js)

  private async extractRar(data: ArrayBuffer, allowed?: Set<string>): Promise<ExtractedImage[]> {
    const unrar = await requirePeerDep<UnrarModule>('node-unrar-js', 'CBR comic archives')
    const extractor = await unrar.createExtractorFromData({ data })

    // Use a filter function so the generator only yields files we want,
    // avoiding re-iterating the fileHeaders generator.
    const { files: extracted } = extractor.extract({
      files: (header) =>
        !header.flags.encrypted &&
        !header.flags.directory &&
        isImage(fileBasename(header.name), allowed),
    })

    const files: ExtractedImage[] = []
    for (const f of extracted) {
      if (!f.extraction) continue
      const name = fileBasename(f.fileHeader.name)
      const ext = fileExt(name)
      const raw = f.extraction
      const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer
      files.push({ name, data: buf, ext, mimeType: IMAGE_MIME[ext] ?? 'application/octet-stream' })
    }

    return files.sort((a, b) => naturalCompare(a.name, b.name))
  }

  // -- CB7 via 7z-wasm ---------------------------------------------------------
  // Peer dep: 7z-wasm ^1.2.0  (npm install 7z-wasm)
  // Uses an Emscripten virtual FS: write archive in → call main → read files out.

  private async extract7z(data: ArrayBuffer, allowed?: Set<string>): Promise<ExtractedImage[]> {
    const sevenZipMod = await requirePeerDep<SevenZipModule>('7z-wasm', 'CB7 comic archives')
    // Silence 7-Zip stdout/stderr to keep the browser console clean
    const sz = await sevenZipMod.default({ print: () => {}, printErr: () => {} })

    const archivePath = '/comic_input.7z'
    const outDir = '/cb7_output'

    sz.FS.writeFile(archivePath, new Uint8Array(data))
    try { sz.FS.mkdir(outDir) } catch { /* already exists */ }
    sz.callMain(['x', archivePath, `-o${outDir}`, '-y'])

    const files: ExtractedImage[] = []
    this.readDirRecursive(sz.FS, outDir, files, allowed)

    // Clean up virtual FS to free memory
    try { sz.FS.unlink(archivePath) } catch { /* ignore */ }

    return files.sort((a, b) => naturalCompare(a.name, b.name))
  }

  private readDirRecursive(
    fs: SevenZipFS,
    dir: string,
    out: ExtractedImage[],
    allowed?: Set<string>,
  ): void {
    let entries: string[]
    try { entries = fs.readdir(dir) } catch { return }

    for (const entry of entries) {
      if (entry === '.' || entry === '..') continue
      const fullPath = `${dir}/${entry}`
      try {
        const stat = fs.stat(fullPath)
        if (fs.isDir(stat.mode)) {
          this.readDirRecursive(fs, fullPath, out, allowed)
        } else if (fs.isFile(stat.mode)) {
          const name = fileBasename(fullPath)
          if (!isImage(name, allowed)) continue
          const ext = fileExt(name)
          const raw = fs.readFile(fullPath)
          const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer
          out.push({ name, data: buf, ext, mimeType: IMAGE_MIME[ext] ?? 'application/octet-stream' })
        }
      } catch { /* skip unreadable entries */ }
    }
  }

  // ---------------------------------------------------------------------------
  // Lazy page loading
  // ---------------------------------------------------------------------------

  private async loadPage(pageNum: number): Promise<void> {
    if (this.loadedPages.has(pageNum)) return
    this.loadedPages.add(pageNum)

    const pageEl = this.pageElements[pageNum - 1]
    const page = this.pages[pageNum - 1]
    if (!pageEl || !page) return

    try {
      const blobUrl = await this.getImageBlobUrl(page)
      this.blobUrls.push(blobUrl)

      const img = document.createElement('img')
      img.alt = `Page ${pageNum}`
      img.draggable = false
      img.decoding = 'async'

      img.onload = () => {
        const nw = img.naturalWidth
        const nh = img.naturalHeight
        this.pageDims.set(pageNum, { w: nw, h: nh })
        if (!this.fitMode) {
          const w = nw * this.state.zoom
          const h = nh * this.state.zoom
          img.style.width = `${w}px`
          img.style.height = `${h}px`
          pageEl.style.width = `${w}px`
          pageEl.style.height = `${h}px`
        }
      }

      if (!this.fitMode) {
        img.style.width = pageEl.style.width
        img.style.height = pageEl.style.height
      }
      img.src = blobUrl

      pageEl.innerHTML = ''
      pageEl.appendChild(img)
    } catch {
      this.loadedPages.delete(pageNum)
    }
  }

  private async getImageBlobUrl(page: ExtractedImage): Promise<string> {
    // TIFF via utif
    if ((page.ext === 'tiff' || page.ext === 'tif') && this.utifDecoder) {
      return this.decodeTiff(page.data)
    }

    // JPEG XL via @jsquash/jxl
    if (page.ext === 'jxl' && this.jxlDecoder) {
      return this.decodeJxl(page.data)
    }

    // Native browser formats
    return URL.createObjectURL(new Blob([page.data], { type: page.mimeType }))
  }

  private async decodeTiff(data: ArrayBuffer): Promise<string> {
    const UTIF = this.utifDecoder!.default
    const ifds = UTIF.decode(data)
    if (!ifds.length) throw new Error('Empty TIFF file')
    UTIF.decodeImage(data, ifds[0])
    const { width, height, data: rgba } = ifds[0]
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')!
    ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0)
    return new Promise<string>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('Failed to encode TIFF as PNG')); return }
        resolve(URL.createObjectURL(blob))
      }, 'image/png')
    })
  }

  private async decodeJxl(data: ArrayBuffer): Promise<string> {
    const imageData = await this.jxlDecoder!.decode(data)
    const canvas = document.createElement('canvas')
    canvas.width = imageData.width
    canvas.height = imageData.height
    canvas.getContext('2d')!.putImageData(imageData, 0, 0)
    return new Promise<string>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('Failed to encode JXL as PNG')); return }
        resolve(URL.createObjectURL(blob))
      }, 'image/png')
    })
  }

  // ---------------------------------------------------------------------------
  // Page tracking
  // ---------------------------------------------------------------------------

  private updateCurrentPage(): void {
    const viewportRect = this.viewport.getBoundingClientRect()
    const mid = viewportRect.top + viewportRect.height / 2

    for (let i = 0; i < this.pageElements.length; i++) {
      const rect = this.pageElements[i].getBoundingClientRect()
      if (rect.top <= mid && rect.bottom >= mid) {
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
    this.pageElements[page - 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // ---------------------------------------------------------------------------
  // Zoom
  // ---------------------------------------------------------------------------

  protected resolveZoomMode(mode: 'fit-width' | 'fit-page'): number {
    const vw = this.viewport.clientWidth
    if (!vw) return 1
    // Find the first page with known dimensions
    for (const [, dims] of this.pageDims) {
      if (dims.w > 0) {
        if (mode === 'fit-width') return (vw - 32) / dims.w // 16px padding each side
        const vh = this.viewport.clientHeight
        return Math.min((vw - 32) / dims.w, (vh - 32) / dims.h)
      }
    }
    return 1
  }

  protected onZoomChange(zoom: number): void {
    this.state.zoom = clamp(zoom, 0.1, 10)
    if (this.fitMode) return // CSS controls sizing in fit mode
    for (let i = 0; i < this.pageElements.length; i++) {
      const pageEl = this.pageElements[i]
      const dims = this.pageDims.get(i + 1)
      if (dims) {
        const w = dims.w * this.state.zoom
        const h = dims.h * this.state.zoom
        pageEl.style.width = `${w}px`
        pageEl.style.height = `${h}px`
        const img = pageEl.querySelector('img')
        if (img) { img.style.width = `${w}px`; img.style.height = `${h}px` }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Fit-mode toggle (wrap button)
  // ---------------------------------------------------------------------------

  toggleWrap(): boolean {
    this.fitMode = !this.fitMode

    if (this.fitMode) {
      this.pagesContainer.classList.add('dv-comic-fit-mode')
      // Clear inline sizes so CSS controls layout
      for (const pageEl of this.pageElements) {
        pageEl.style.width = ''
        pageEl.style.height = ''
        const img = pageEl.querySelector('img') as HTMLImageElement | null
        if (img) { img.style.width = ''; img.style.height = '' }
        const placeholder = pageEl.querySelector('.dv-browse-page-placeholder') as HTMLElement | null
        if (placeholder) { placeholder.style.width = ''; placeholder.style.height = '' }
      }
    } else {
      this.pagesContainer.classList.remove('dv-comic-fit-mode')
      // Re-apply zoom-based sizing
      for (let i = 0; i < this.pageElements.length; i++) {
        const pageEl = this.pageElements[i]
        const dims = this.pageDims.get(i + 1)
        if (dims) {
          const w = dims.w * this.state.zoom
          const h = dims.h * this.state.zoom
          pageEl.style.width = `${w}px`
          pageEl.style.height = `${h}px`
          const img = pageEl.querySelector('img') as HTMLImageElement | null
          if (img) { img.style.width = `${w}px`; img.style.height = `${h}px` }
        } else {
          pageEl.style.width = `${800 * this.state.zoom}px`
          pageEl.style.height = `${1200 * this.state.zoom}px`
        }
      }
    }

    return this.fitMode
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  protected onDestroy(): void {
    this.observer?.disconnect()
    this.debouncedScroll?.cancel()
    for (const url of this.blobUrls) URL.revokeObjectURL(url)
    this.pageElements = []
    this.pages = []
    this.blobUrls = []
    this.pageDims.clear()
    this.loadedPages.clear()
  }
}

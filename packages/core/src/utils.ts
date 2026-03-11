import type { DocumentSource, DocumentFormat, PolyRenderError } from './types.js'
import { PolyRenderError as DVError } from './types.js'

// ---------------------------------------------------------------------------
// DOM Helpers
// ---------------------------------------------------------------------------

/** Create an element with optional class and attributes. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  attrs?: Record<string, string>,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  if (className) element.className = className
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      element.setAttribute(k, v)
    }
  }
  return element
}

/** Create an SVG icon from a path string (16x16 viewBox). */
export function svgIcon(pathD: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.5')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', pathD)
  svg.appendChild(path)
  return svg
}

/** Common SVG icon paths (16x16 coordinate space). */
export const icons = {
  chevronLeft: 'M10 3 L5 8 L10 13',
  chevronRight: 'M6 3 L11 8 L6 13',
  zoomIn: 'M7.5 3v9M3 7.5h9M12.5 12.5 L15 15',
  zoomOut: 'M3 7.5h9M12.5 12.5 L15 15',
  fitWidth: 'M1 4h14M1 12h14M4 1v3M4 12v3M12 1v3M12 12v3',
  fullscreen: 'M2 5V2h3M11 2h3v3M14 11v3h-3M5 14H2v-3',
  download: 'M8 2v8M4 7l4 4 4-4M3 13h10',
  wrapToggle: 'M2 4h12M2 9h6M13 7v2a2 2 0 0 1-2 2H5m2-2L5 11l2 2',
} as const

/** Remove all child nodes from an element. */
export function clearElement(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild)
}


// ---------------------------------------------------------------------------
// Format Detection
// ---------------------------------------------------------------------------

const EXTENSION_MAP: Record<string, DocumentFormat> = {
  // Comic book archives
  cbz: 'comic',
  cbr: 'comic',
  cb7: 'comic',
  cbt: 'comic',
  cba: 'comic',
  pdf: 'pdf',
  epub: 'epub',
  docx: 'docx',
  doc: 'docx',
  odt: 'odt',
  ods: 'ods',
  csv: 'csv',
  tsv: 'tsv',
  txt: 'text',
  text: 'text',
  md: 'markdown',
  markdown: 'markdown',
  html: 'html',
  htm: 'html',
  json: 'json',
  xml: 'xml',
  svg: 'xml',
  // Common code extensions
  js: 'code', jsx: 'code', ts: 'code', tsx: 'code', mjs: 'code', cjs: 'code',
  py: 'code', rb: 'code', rs: 'code', go: 'code', java: 'code', kt: 'code',
  c: 'code', h: 'code', cpp: 'code', hpp: 'code', cc: 'code',
  cs: 'code', swift: 'code', m: 'code',
  php: 'code', pl: 'code', r: 'code', lua: 'code', zig: 'code',
  sh: 'code', bash: 'code', zsh: 'code', fish: 'code', ps1: 'code',
  sql: 'code', graphql: 'code', gql: 'code',
  yaml: 'code', yml: 'code', toml: 'code', ini: 'code', env: 'code',
  dockerfile: 'code', makefile: 'code',
  css: 'code', scss: 'code', sass: 'code', less: 'code',
  vue: 'code', svelte: 'code', astro: 'code',
  hs: 'code', elm: 'code', ex: 'code', exs: 'code', erl: 'code',
  clj: 'code', cljs: 'code', lisp: 'code', scm: 'code',
  dart: 'code', scala: 'code', groovy: 'code',
  proto: 'code', thrift: 'code',
  tf: 'code', hcl: 'code',
  sol: 'code', move: 'code',
  wasm: 'code', wat: 'code',
}

const MIME_MAP: Record<string, DocumentFormat> = {
  // Comic book archives
  'application/vnd.comicbook+zip': 'comic',
  'application/vnd.comicbook-rar': 'comic',
  'application/x-cbr': 'comic',
  'application/x-cbz': 'comic',
  'application/x-cb7': 'comic',
  'application/x-cbt': 'comic',
  'application/pdf': 'pdf',
  'application/epub+zip': 'epub',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'docx',
  'application/vnd.oasis.opendocument.text': 'odt',
  'application/vnd.oasis.opendocument.spreadsheet': 'ods',
  'text/csv': 'csv',
  'text/tab-separated-values': 'tsv',
  'text/plain': 'text',
  'text/markdown': 'markdown',
  'text/html': 'html',
  'application/json': 'json',
  'application/xml': 'xml',
  'text/xml': 'xml',
  'image/svg+xml': 'xml',
  'application/javascript': 'code',
  'text/javascript': 'code',
  'application/typescript': 'code',
  'text/x-python': 'code',
  'text/x-rust': 'code',
  'text/x-go': 'code',
  'text/x-java-source': 'code',
  'text/x-c': 'code',
  'text/x-c++src': 'code',
  'text/css': 'code',
  'text/x-yaml': 'code',
  'text/x-toml': 'code',
  'text/x-shellscript': 'code',
  'application/x-sh': 'code',
  'text/x-sql': 'code',
}

/** Map file extension to highlight.js language identifier. */
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  py: 'python', rb: 'ruby', rs: 'rust', go: 'go', java: 'java',
  kt: 'kotlin', c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', cc: 'cpp',
  cs: 'csharp', swift: 'swift', m: 'objectivec',
  php: 'php', pl: 'perl', r: 'r', lua: 'lua',
  sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'bash', ps1: 'powershell',
  sql: 'sql', graphql: 'graphql',
  yaml: 'yaml', yml: 'yaml', toml: 'toml', ini: 'ini',
  dockerfile: 'dockerfile', makefile: 'makefile',
  css: 'css', scss: 'scss', sass: 'scss', less: 'less',
  html: 'html', htm: 'html', xml: 'xml', svg: 'xml',
  json: 'json', md: 'markdown', markdown: 'markdown',
  vue: 'html', svelte: 'html', astro: 'html',
  hs: 'haskell', elm: 'elm', ex: 'elixir', exs: 'elixir', erl: 'erlang',
  clj: 'clojure', cljs: 'clojure', lisp: 'lisp', scm: 'scheme',
  dart: 'dart', scala: 'scala', groovy: 'groovy',
  proto: 'protobuf', tf: 'hcl', sol: 'solidity',
}

/** Extract file extension from a filename or URL path. */
export function getExtension(filenameOrUrl: string): string {
  const clean = filenameOrUrl.split('?')[0].split('#')[0]
  const lastSlash = clean.lastIndexOf('/')
  const basename = lastSlash >= 0 ? clean.slice(lastSlash + 1) : clean
  const dot = basename.lastIndexOf('.')
  if (dot < 0) return basename.toLowerCase() // no extension, use whole name (e.g., "Makefile")
  return basename.slice(dot + 1).toLowerCase()
}

/** Detect document format from a source descriptor. */
export function detectFormat(source: DocumentSource): DocumentFormat | null {
  // Pages and chunked sources have explicit types
  if (source.type === 'pages') return 'pages'
  if (source.type === 'chunked') return 'chunked-pdf'

  // Try MIME type first
  const mime = 'mimeType' in source ? source.mimeType : undefined
  if (mime && MIME_MAP[mime]) return MIME_MAP[mime]

  // Try filename / URL extension
  let name: string | undefined
  if ('filename' in source) name = source.filename
  if (!name && source.type === 'url') name = source.url

  if (name) {
    const ext = getExtension(name)
    if (EXTENSION_MAP[ext]) return EXTENSION_MAP[ext]
  }

  return null
}

/** Get highlight.js language from file extension. */
export function getLanguageFromExtension(filename: string): string | undefined {
  const ext = getExtension(filename)
  return EXTENSION_TO_LANGUAGE[ext]
}

/** Determine which underlying renderer format to use. Some formats alias to the same renderer. */
export function getRendererFormat(format: DocumentFormat): DocumentFormat {
  switch (format) {
    case 'markdown':
    case 'html':
    case 'json':
    case 'xml':
      // These are rendered as code with language-specific highlighting
      return 'code'
    case 'tsv':
      return 'csv'
    case 'chunked-pdf':
      return 'chunked-pdf'
    case 'pages':
      return 'pages'
    default:
      return format
  }
}


// ---------------------------------------------------------------------------
// Data Conversion
// ---------------------------------------------------------------------------

/** Convert various binary types to ArrayBuffer. */
export async function toArrayBuffer(
  data: Blob | ArrayBuffer | Uint8Array,
): Promise<ArrayBuffer> {
  if (data instanceof ArrayBuffer) return data
  if (data instanceof Uint8Array) return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
  return data.arrayBuffer()
}

/** Convert various binary types to Blob. */
export function toBlob(
  data: Blob | ArrayBuffer | Uint8Array,
  mimeType = 'application/octet-stream',
): Blob {
  if (data instanceof Blob) return data
  return new Blob([data as BlobPart], { type: mimeType })
}

/** Read binary data as UTF-8 text. */
export async function toText(data: Blob | ArrayBuffer | Uint8Array): Promise<string> {
  if (data instanceof Blob) return data.text()
  const decoder = new TextDecoder('utf-8')
  return decoder.decode(data instanceof ArrayBuffer ? data : data.buffer)
}

/** Fetch a URL as ArrayBuffer with optional custom fetch options. */
export async function fetchAsBuffer(
  url: string,
  options?: RequestInit,
): Promise<ArrayBuffer> {
  const response = await fetch(url, options)
  if (!response.ok) {
    throw new DVError(
      'SOURCE_LOAD_FAILED',
      `Failed to fetch ${url}: ${response.status} ${response.statusText}`,
    )
  }
  return response.arrayBuffer()
}


// ---------------------------------------------------------------------------
// Peer Dependency Loading
// ---------------------------------------------------------------------------

/**
 * Attempt a dynamic import and throw a helpful error if the module is missing.
 * Each renderer calls this for its peer dependency.
 */
export async function requirePeerDep<T>(
  moduleName: string,
  formatName: string,
): Promise<T> {
  try {
    const mod = await import(/* @vite-ignore */ moduleName)
    return mod as T
  } catch {
    throw new DVError(
      'PEER_DEPENDENCY_MISSING',
      `The "${moduleName}" package is required to render ${formatName} files. ` +
      `Install it with: npm install ${moduleName}`,
    )
  }
}


// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

/** Clamp a number between min and max. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/** Debounce a function. */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  ms: number,
): T & { cancel(): void } {
  let timer: ReturnType<typeof setTimeout>
  const debounced = ((...args: unknown[]) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }) as T & { cancel(): void }
  debounced.cancel = () => clearTimeout(timer)
  return debounced
}

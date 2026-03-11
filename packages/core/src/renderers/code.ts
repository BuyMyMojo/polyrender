import type { PolyRenderOptions, DocumentFormat } from '../types.js'
import { BaseRenderer } from '../renderer.js'
import { el, toText, fetchAsBuffer, requirePeerDep, getLanguageFromExtension } from '../utils.js'

interface HighlightJS {
  highlight(code: string, options: { language: string }): { value: string }
  highlightAuto(code: string): { value: string; language: string }
  getLanguage(name: string): unknown
}

/**
 * Renders source code and structured text (JSON, XML, YAML, Markdown, HTML)
 * with syntax highlighting via highlight.js, line numbers, and optional word wrap.
 *
 * Falls back to plain text rendering if highlight.js is not installed.
 */
export class CodeRenderer extends BaseRenderer {
  readonly format: DocumentFormat = 'code'

  private codeContainer!: HTMLElement
  private codeBody!: HTMLElement
  private hljs: HighlightJS | null = null
  private wordWrap = false

  protected async onMount(viewport: HTMLElement, options: PolyRenderOptions): Promise<void> {
    this.showLoading('Loading file…')

    // Try to load highlight.js (optional peer dep)
    try {
      this.hljs = await requirePeerDep<HighlightJS>('highlight.js', 'code')
    } catch {
      this.hljs = null // Fallback to plain text
    }

    const text = await this.loadText(options)
    this.hideLoading()

    const codeOpts = options.code ?? {}
    const showLineNumbers = codeOpts.lineNumbers !== false
    const wordWrap = codeOpts.wordWrap === true

    // Detect language
    const language = codeOpts.language
      ?? this.detectLanguage(options)
      ?? undefined

    // Highlight
    let highlightedHtml: string
    if (this.hljs && language && this.hljs.getLanguage(language)) {
      highlightedHtml = this.hljs.highlight(text, { language }).value
    } else if (this.hljs) {
      const auto = this.hljs.highlightAuto(text)
      highlightedHtml = auto.value
    } else {
      highlightedHtml = this.escapeHtml(text)
    }

    // Build DOM
    this.codeContainer = el('div', 'dv-code-container')
    viewport.appendChild(this.codeContainer)

    const lines = text.split('\n')

    // Line numbers gutter
    if (showLineNumbers) {
      const gutter = el('div', 'dv-code-gutter')
      gutter.setAttribute('aria-hidden', 'true')
      for (let i = 1; i <= lines.length; i++) {
        const lineNum = el('div', 'dv-code-gutter-line')
        lineNum.textContent = String(i)
        gutter.appendChild(lineNum)
      }
      this.codeContainer.appendChild(gutter)
    }

    // Code body
    this.wordWrap = wordWrap
    const body = el('pre', `dv-code-body${wordWrap ? ' dv-word-wrap' : ''}`)
    const codeEl = document.createElement('code')
    if (language) codeEl.className = `language-${language}`
    codeEl.innerHTML = highlightedHtml
    if (codeOpts.tabSize) {
      body.style.tabSize = String(codeOpts.tabSize)
    }
    body.appendChild(codeEl)
    this.codeContainer.appendChild(body)
    this.codeBody = body

    this.setReady({
      format: 'code',
      pageCount: 1,
      filename: this.getFilename(options),
    })
  }

  private async loadText(options: PolyRenderOptions): Promise<string> {
    const source = options.source
    if (source.type === 'file') return toText(source.data)
    if (source.type === 'url') {
      const buffer = await fetchAsBuffer(source.url, source.fetchOptions)
      return new TextDecoder('utf-8').decode(buffer)
    }
    return ''
  }

  private detectLanguage(options: PolyRenderOptions): string | null {
    // From explicit format
    const format = options.format
    if (format && format !== 'code') {
      const map: Record<string, string> = {
        json: 'json',
        xml: 'xml',
        html: 'html',
        markdown: 'markdown',
        md: 'markdown',
      }
      if (map[format]) return map[format]
    }

    // From filename
    const source = options.source
    const name = ('filename' in source ? source.filename : undefined)
      ?? (source.type === 'url' ? source.url : undefined)
    if (name) {
      const lang = getLanguageFromExtension(name)
      if (lang) return lang
    }

    return null
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  private getFilename(options: PolyRenderOptions): string | undefined {
    const source = options.source
    if ('filename' in source && source.filename) return source.filename
    if (source.type === 'url') return source.url.split('/').pop()?.split('?')[0]
    return undefined
  }

  toggleWrap(): boolean {
    this.wordWrap = !this.wordWrap
    this.codeBody.classList.toggle('dv-word-wrap', this.wordWrap)
    return this.wordWrap
  }

  protected onDestroy(): void {
    this.hljs = null
  }
}

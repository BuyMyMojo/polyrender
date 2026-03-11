import type { PolyRenderOptions, DocumentFormat } from '../types.js'
import { BaseRenderer } from '../renderer.js'
import { el, toArrayBuffer, fetchAsBuffer, requirePeerDep } from '../utils.js'

interface JSZip {
  loadAsync(data: ArrayBuffer | Uint8Array | Blob): Promise<JSZipInstance>
}

interface JSZipInstance {
  file(name: string): JSZipFile | null
  files: Record<string, JSZipFile>
}

interface JSZipFile {
  async(type: 'string'): Promise<string>
  async(type: 'arraybuffer'): Promise<ArrayBuffer>
}

/**
 * Renders ODT (OpenDocument Text) files by extracting content.xml from the
 * ZIP archive and converting ODF XML tags to styled HTML.
 *
 * Peer dependency: jszip
 */
export class OdtRenderer extends BaseRenderer {
  readonly format: DocumentFormat = 'odt'

  private odtContainer!: HTMLElement

  protected async onMount(viewport: HTMLElement, options: PolyRenderOptions): Promise<void> {
    this.showLoading('Rendering ODT document…')

    const JSZipLib = await requirePeerDep<JSZip>('jszip', 'ODT')
    const data = await this.loadData(options)

    // Parse the ZIP archive
    const zip = await JSZipLib.loadAsync(data)

    // Extract content.xml (the main document content)
    const contentFile = zip.file('content.xml')
    if (!contentFile) {
      throw new Error('Invalid ODT file: missing content.xml')
    }
    const contentXml = await contentFile.async('string')

    // Extract styles.xml for additional styling info
    const stylesFile = zip.file('styles.xml')
    const stylesXml = stylesFile ? await stylesFile.async('string') : ''

    this.hideLoading()

    // Build the rendered view
    this.odtContainer = el('div', 'dv-odt-container')
    viewport.appendChild(this.odtContainer)

    // Apply font overrides
    const odtOpts = options.odt ?? {}
    if (odtOpts.fontSize) {
      this.odtContainer.style.fontSize = `${odtOpts.fontSize}px`
    }
    if (odtOpts.fontFamily) {
      this.odtContainer.style.fontFamily = odtOpts.fontFamily
    }

    // Parse and render the XML content
    const html = this.convertOdfToHtml(contentXml, stylesXml)
    this.odtContainer.innerHTML = html

    this.setReady({
      format: 'odt',
      pageCount: 1,
      filename: this.getFilename(options),
    })
  }

  private convertOdfToHtml(contentXml: string, _stylesXml: string): string {
    const parser = new DOMParser()
    const doc = parser.parseFromString(contentXml, 'application/xml')

    // Find the office:body > office:text element
    const body = doc.getElementsByTagName('office:text')[0]
      ?? doc.getElementsByTagName('office:body')[0]

    if (!body) {
      return '<p style="color: var(--dv-text-secondary)">No content found in document.</p>'
    }

    // Parse automatic-styles for style name → CSS mapping
    const styleMap = this.parseAutomaticStyles(doc)

    return this.convertNode(body, styleMap)
  }

  private parseAutomaticStyles(doc: Document): Map<string, string> {
    const map = new Map<string, string>()
    const autoStyles = doc.getElementsByTagName('office:automatic-styles')[0]
    if (!autoStyles) return map

    const styles = autoStyles.getElementsByTagName('style:style')
    for (let i = 0; i < styles.length; i++) {
      const style = styles[i]
      const name = style.getAttribute('style:name')
      if (!name) continue

      const cssProps: string[] = []

      // Parse text-properties
      const textProps = style.getElementsByTagName('style:text-properties')
      for (let j = 0; j < textProps.length; j++) {
        const tp = textProps[j]
        const bold = tp.getAttribute('fo:font-weight')
        const italic = tp.getAttribute('fo:font-style')
        const fontSize = tp.getAttribute('fo:font-size')
        const color = tp.getAttribute('fo:color')
        const underline = tp.getAttribute('style:text-underline-style')
        const fontFamily = tp.getAttribute('style:font-name') ?? tp.getAttribute('fo:font-family')
        const bgColor = tp.getAttribute('fo:background-color')
        const strikethrough = tp.getAttribute('style:text-line-through-style')

        if (bold === 'bold') cssProps.push('font-weight:bold')
        if (italic === 'italic') cssProps.push('font-style:italic')
        if (fontSize) cssProps.push(`font-size:${fontSize}`)
        if (color && color !== 'transparent') cssProps.push(`color:${color}`)
        if (underline && underline !== 'none') cssProps.push('text-decoration:underline')
        if (strikethrough && strikethrough !== 'none') cssProps.push('text-decoration:line-through')
        if (fontFamily) cssProps.push(`font-family:${fontFamily}`)
        if (bgColor && bgColor !== 'transparent') cssProps.push(`background-color:${bgColor}`)
      }

      // Parse paragraph-properties
      const paraProps = style.getElementsByTagName('style:paragraph-properties')
      for (let j = 0; j < paraProps.length; j++) {
        const pp = paraProps[j]
        const align = pp.getAttribute('fo:text-align')
        const marginTop = pp.getAttribute('fo:margin-top')
        const marginBottom = pp.getAttribute('fo:margin-bottom')
        const marginLeft = pp.getAttribute('fo:margin-left')
        const lineHeight = pp.getAttribute('fo:line-height')

        if (align) {
          const cssAlign = align === 'start' ? 'left' : align === 'end' ? 'right' : align
          cssProps.push(`text-align:${cssAlign}`)
        }
        if (marginTop) cssProps.push(`margin-top:${marginTop}`)
        if (marginBottom) cssProps.push(`margin-bottom:${marginBottom}`)
        if (marginLeft) cssProps.push(`margin-left:${marginLeft}`)
        if (lineHeight) cssProps.push(`line-height:${lineHeight}`)
      }

      if (cssProps.length > 0) {
        map.set(name, cssProps.join(';'))
      }
    }

    return map
  }

  private convertNode(node: Node, styleMap: Map<string, string>): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return this.escapeHtml(node.textContent ?? '')
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return ''
    const elem = node as Element
    const tag = elem.tagName

    switch (tag) {
      case 'text:p': {
        const style = this.getStyleAttr(elem, styleMap)
        const content = this.convertChildren(elem, styleMap)
        return `<p${style}>${content || '&nbsp;'}</p>`
      }

      case 'text:h': {
        const level = elem.getAttribute('text:outline-level') ?? '1'
        const lvl = Math.min(Math.max(parseInt(level, 10), 1), 6)
        const style = this.getStyleAttr(elem, styleMap)
        const content = this.convertChildren(elem, styleMap)
        return `<h${lvl}${style}>${content}</h${lvl}>`
      }

      case 'text:span': {
        const style = this.getStyleAttr(elem, styleMap)
        return `<span${style}>${this.convertChildren(elem, styleMap)}</span>`
      }

      case 'text:a': {
        const href = elem.getAttribute('xlink:href') ?? '#'
        return `<a href="${this.escapeHtml(href)}" target="_blank" rel="noopener">${this.convertChildren(elem, styleMap)}</a>`
      }

      case 'text:list':
        return `<ul>${this.convertChildren(elem, styleMap)}</ul>`

      case 'text:list-item':
        return `<li>${this.convertChildren(elem, styleMap)}</li>`

      case 'text:line-break':
        return '<br>'

      case 'text:tab':
        return '&emsp;'

      case 'text:s': {
        const count = parseInt(elem.getAttribute('text:c') ?? '1', 10)
        return '&nbsp;'.repeat(count)
      }

      case 'text:soft-page-break':
        return '<hr style="border:none;border-top:1px dashed var(--dv-border);margin:1.5em 0">'

      case 'table:table': {
        const content = this.convertChildren(elem, styleMap)
        return `<table class="dv-table">${content}</table>`
      }

      case 'table:table-header-rows':
        return `<thead>${this.convertChildren(elem, styleMap)}</thead>`

      case 'table:table-row':
        return `<tr>${this.convertChildren(elem, styleMap)}</tr>`

      case 'table:table-cell': {
        const colspan = elem.getAttribute('table:number-columns-spanned')
        const rowspan = elem.getAttribute('table:number-rows-spanned')
        const attrs: string[] = []
        if (colspan && colspan !== '1') attrs.push(`colspan="${colspan}"`)
        if (rowspan && rowspan !== '1') attrs.push(`rowspan="${rowspan}"`)
        const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : ''
        return `<td${attrStr}>${this.convertChildren(elem, styleMap)}</td>`
      }

      case 'draw:frame':
      case 'draw:image':
        // Skip embedded images (would require extracting from ZIP)
        return '<span style="color:var(--dv-text-secondary)">[image]</span>'

      default:
        // Recurse into unknown elements
        return this.convertChildren(elem, styleMap)
    }
  }

  private convertChildren(elem: Element, styleMap: Map<string, string>): string {
    const parts: string[] = []
    for (let i = 0; i < elem.childNodes.length; i++) {
      parts.push(this.convertNode(elem.childNodes[i], styleMap))
    }
    return parts.join('')
  }

  private getStyleAttr(elem: Element, styleMap: Map<string, string>): string {
    const styleName = elem.getAttribute('text:style-name')
    if (styleName && styleMap.has(styleName)) {
      return ` style="${styleMap.get(styleName)!}"`
    }
    return ''
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  private async loadData(options: PolyRenderOptions): Promise<ArrayBuffer> {
    const source = options.source
    if (source.type === 'file') return toArrayBuffer(source.data)
    if (source.type === 'url') return fetchAsBuffer(source.url, source.fetchOptions)
    throw new Error('ODT renderer requires a file or url source.')
  }

  private getFilename(options: PolyRenderOptions): string | undefined {
    const source = options.source
    if ('filename' in source && source.filename) return source.filename
    if (source.type === 'url') return source.url.split('/').pop()?.split('?')[0]
    return undefined
  }

  protected onDestroy(): void {
    // DOM cleanup is sufficient
  }
}

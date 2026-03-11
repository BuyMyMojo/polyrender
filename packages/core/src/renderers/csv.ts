import type { PolyRenderOptions, DocumentFormat } from '../types.js'
import { BaseRenderer } from '../renderer.js'
import { el, toText, fetchAsBuffer, requirePeerDep } from '../utils.js'

interface PapaParse {
  parse(input: string, config?: {
    delimiter?: string
    header?: boolean
    preview?: number
    dynamicTyping?: boolean
    skipEmptyLines?: boolean
  }): {
    data: Record<string, string>[] | string[][]
    meta: { fields?: string[]; delimiter: string }
    errors: { message: string }[]
  }
}

/**
 * Renders CSV and TSV files as a scrollable, sortable table.
 * Uses PapaParse for robust parsing and renders a lightweight
 * HTML table with sticky headers and striped rows.
 */
export class CsvRenderer extends BaseRenderer {
  readonly format: DocumentFormat = 'csv'

  private tableContainer!: HTMLElement
  private headers: string[] = []
  private rows: string[][] = []
  private sortCol = -1
  private sortAsc = true

  protected async onMount(viewport: HTMLElement, options: PolyRenderOptions): Promise<void> {
    this.showLoading('Parsing data…')

    const Papa = await requirePeerDep<PapaParse>('papaparse', 'CSV')
    const text = await this.loadText(options)

    const csvOpts = options.csv ?? {}
    const useHeader = csvOpts.header !== false
    const maxRows = csvOpts.maxRows ?? 10000
    const sortable = csvOpts.sortable !== false

    const result = Papa.parse(text, {
      delimiter: csvOpts.delimiter || undefined,
      header: false, // We'll handle headers ourselves for more control
      preview: maxRows + 1, // +1 for header row
      skipEmptyLines: true,
    })

    const rawRows = result.data as string[][]
    if (rawRows.length === 0) {
      this.hideLoading()
      this.setReady({ format: 'csv', pageCount: 1 })
      viewport.appendChild(el('div', 'dv-loading'))
      viewport.querySelector('.dv-loading')!.textContent = 'No data found.'
      return
    }

    if (useHeader && rawRows.length > 1) {
      this.headers = rawRows[0].map((h, i) => h || `Column ${i + 1}`)
      this.rows = rawRows.slice(1, maxRows + 1)
    } else {
      this.headers = rawRows[0].map((_, i) => `Column ${i + 1}`)
      this.rows = rawRows.slice(0, maxRows)
    }

    this.hideLoading()

    // Build table
    this.tableContainer = el('div', 'dv-table-container')
    viewport.appendChild(this.tableContainer)
    this.renderTable(sortable)

    this.setReady({
      format: 'csv',
      pageCount: 1,
      filename: this.getFilename(options),
    })
  }

  private renderTable(sortable: boolean): void {
    const table = el('table', 'dv-table')

    // Header
    const thead = document.createElement('thead')
    const headerRow = document.createElement('tr')

    // Row number column
    const rowNumTh = document.createElement('th')
    rowNumTh.className = 'dv-table-row-number'
    rowNumTh.textContent = '#'
    headerRow.appendChild(rowNumTh)

    this.headers.forEach((header, colIdx) => {
      const th = document.createElement('th')
      th.textContent = header
      if (sortable) {
        th.dataset.sortable = 'true'
        th.addEventListener('click', () => this.sortByColumn(colIdx))
        if (this.sortCol === colIdx) {
          th.textContent = `${header} ${this.sortAsc ? '↑' : '↓'}`
        }
      }
      headerRow.appendChild(th)
    })
    thead.appendChild(headerRow)
    table.appendChild(thead)

    // Body
    const tbody = document.createElement('tbody')
    this.rows.forEach((row, rowIdx) => {
      const tr = document.createElement('tr')

      // Row number
      const rowNumTd = document.createElement('td')
      rowNumTd.className = 'dv-table-row-number'
      rowNumTd.textContent = String(rowIdx + 1)
      tr.appendChild(rowNumTd)

      for (let colIdx = 0; colIdx < this.headers.length; colIdx++) {
        const td = document.createElement('td')
        td.textContent = row[colIdx] ?? ''
        td.title = row[colIdx] ?? ''
        tr.appendChild(td)
      }
      tbody.appendChild(tr)
    })
    table.appendChild(tbody)

    this.tableContainer.innerHTML = ''
    this.tableContainer.appendChild(table)
  }

  private sortByColumn(colIdx: number): void {
    if (this.sortCol === colIdx) {
      this.sortAsc = !this.sortAsc
    } else {
      this.sortCol = colIdx
      this.sortAsc = true
    }

    this.rows.sort((a, b) => {
      const va = a[colIdx] ?? ''
      const vb = b[colIdx] ?? ''
      // Try numeric comparison
      const na = parseFloat(va)
      const nb = parseFloat(vb)
      if (!isNaN(na) && !isNaN(nb)) {
        return this.sortAsc ? na - nb : nb - na
      }
      // Fall back to string comparison
      return this.sortAsc ? va.localeCompare(vb) : vb.localeCompare(va)
    })

    this.renderTable(true)
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

  private getFilename(options: PolyRenderOptions): string | undefined {
    const source = options.source
    if ('filename' in source && source.filename) return source.filename
    if (source.type === 'url') return source.url.split('/').pop()?.split('?')[0]
    return undefined
  }

  protected onDestroy(): void {
    this.headers = []
    this.rows = []
  }
}

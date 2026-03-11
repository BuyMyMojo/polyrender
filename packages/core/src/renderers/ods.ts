import type { DocViewOptions, DocumentFormat } from '../types.js'
import { BaseRenderer } from '../renderer.js'
import { el, toArrayBuffer, fetchAsBuffer, requirePeerDep } from '../utils.js'

interface XLSXLib {
  read(data: ArrayBuffer, opts?: { type?: string }): XLSXWorkbook
  utils: {
    sheet_to_json<T>(sheet: XLSXWorksheet, opts?: { header?: 1 | string; raw?: boolean }): T[]
  }
}

interface XLSXWorkbook {
  SheetNames: string[]
  Sheets: Record<string, XLSXWorksheet>
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface XLSXWorksheet {}

/**
 * Renders ODS (OpenDocument Spreadsheet) files using the SheetJS (xlsx)
 * library. Parses sheets into arrays and renders sortable HTML tables,
 * with a tab bar for multi-sheet workbooks.
 *
 * Peer dependency: xlsx
 */
export class OdsRenderer extends BaseRenderer {
  readonly format: DocumentFormat = 'ods'

  private odsContainer!: HTMLElement
  private tabBar!: HTMLElement
  private tableContainer!: HTMLElement
  private sheets: { name: string; headers: string[]; rows: string[][] }[] = []
  private activeSheet = 0
  private sortCol = -1
  private sortAsc = true

  protected async onMount(viewport: HTMLElement, options: DocViewOptions): Promise<void> {
    this.showLoading('Parsing spreadsheet…')

    const XLSX = await requirePeerDep<XLSXLib>('xlsx', 'ODS')
    const data = await this.loadData(options)

    const workbook = XLSX.read(data, { type: 'array' })

    const odsOpts = options.ods ?? {}
    const maxRows = odsOpts.maxRows ?? 10000
    const useHeader = odsOpts.header !== false

    // Parse each sheet
    for (const name of workbook.SheetNames) {
      const sheet = workbook.Sheets[name]
      const rawRows = XLSX.utils.sheet_to_json<string[]>(sheet, {
        header: 1,
        raw: false,
      })

      let headers: string[]
      let rows: string[][]

      if (rawRows.length === 0) {
        headers = []
        rows = []
      } else if (useHeader && rawRows.length > 1) {
        headers = rawRows[0].map((h, i) => (h != null && String(h)) || `Column ${i + 1}`)
        rows = rawRows.slice(1, maxRows + 1)
      } else {
        const colCount = Math.max(...rawRows.slice(0, 100).map((r) => r.length), 0)
        headers = Array.from({ length: colCount }, (_, i) => `Column ${i + 1}`)
        rows = rawRows.slice(0, maxRows)
      }

      this.sheets.push({ name, headers, rows })
    }

    this.hideLoading()

    // Build container
    this.odsContainer = el('div', 'dv-ods-container')
    viewport.appendChild(this.odsContainer)

    // Tab bar (only if more than one sheet)
    if (this.sheets.length > 1) {
      this.tabBar = el('div', 'dv-ods-tabs')
      this.odsContainer.appendChild(this.tabBar)
      this.renderTabs()
    }

    // Table
    this.tableContainer = el('div', 'dv-table-container')
    this.odsContainer.appendChild(this.tableContainer)
    this.renderTable(odsOpts.sortable !== false)

    this.setReady({
      format: 'ods',
      pageCount: this.sheets.length,
      filename: this.getFilename(options),
    })
  }

  private renderTabs(): void {
    this.tabBar.innerHTML = ''
    this.sheets.forEach((sheet, idx) => {
      const tab = el('button', `dv-ods-tab${idx === this.activeSheet ? ' dv-ods-tab-active' : ''}`)
      tab.textContent = sheet.name
      tab.addEventListener('click', () => {
        this.activeSheet = idx
        this.sortCol = -1 // Reset sort on sheet change
        this.sortAsc = true
        this.renderTabs()
        this.renderTable(true)
        this.state.currentPage = idx + 1
        this.emitPageChange()
      })
      this.tabBar.appendChild(tab)
    })
  }

  private renderTable(sortable: boolean): void {
    const sheet = this.sheets[this.activeSheet]
    if (!sheet || sheet.headers.length === 0) {
      this.tableContainer.innerHTML =
        '<div class="dv-loading"><span>No data in this sheet.</span></div>'
      return
    }

    const table = el('table', 'dv-table')

    // Header
    const thead = document.createElement('thead')
    const headerRow = document.createElement('tr')

    // Row number column
    const rowNumTh = document.createElement('th')
    rowNumTh.className = 'dv-table-row-number'
    rowNumTh.textContent = '#'
    headerRow.appendChild(rowNumTh)

    sheet.headers.forEach((header, colIdx) => {
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
    sheet.rows.forEach((row, rowIdx) => {
      const tr = document.createElement('tr')

      const rowNumTd = document.createElement('td')
      rowNumTd.className = 'dv-table-row-number'
      rowNumTd.textContent = String(rowIdx + 1)
      tr.appendChild(rowNumTd)

      for (let colIdx = 0; colIdx < sheet.headers.length; colIdx++) {
        const td = document.createElement('td')
        const val = row[colIdx] != null ? String(row[colIdx]) : ''
        td.textContent = val
        td.title = val
        tr.appendChild(td)
      }
      tbody.appendChild(tr)
    })
    table.appendChild(tbody)

    this.tableContainer.innerHTML = ''
    this.tableContainer.appendChild(table)
  }

  private sortByColumn(colIdx: number): void {
    const sheet = this.sheets[this.activeSheet]
    if (!sheet) return

    if (this.sortCol === colIdx) {
      this.sortAsc = !this.sortAsc
    } else {
      this.sortCol = colIdx
      this.sortAsc = true
    }

    sheet.rows.sort((a, b) => {
      const va = a[colIdx] != null ? String(a[colIdx]) : ''
      const vb = b[colIdx] != null ? String(b[colIdx]) : ''
      const na = parseFloat(va)
      const nb = parseFloat(vb)
      if (!isNaN(na) && !isNaN(nb)) {
        return this.sortAsc ? na - nb : nb - na
      }
      return this.sortAsc ? va.localeCompare(vb) : vb.localeCompare(va)
    })

    this.renderTable(true)
  }

  protected onPageChange(page: number): void {
    // Navigate to sheet by page number
    const idx = page - 1
    if (idx >= 0 && idx < this.sheets.length && idx !== this.activeSheet) {
      this.activeSheet = idx
      this.sortCol = -1
      this.sortAsc = true
      if (this.tabBar) this.renderTabs()
      this.renderTable(true)
    }
  }

  private async loadData(options: DocViewOptions): Promise<ArrayBuffer> {
    const source = options.source
    if (source.type === 'file') return toArrayBuffer(source.data)
    if (source.type === 'url') return fetchAsBuffer(source.url, source.fetchOptions)
    throw new Error('ODS renderer requires a file or url source.')
  }

  private getFilename(options: DocViewOptions): string | undefined {
    const source = options.source
    if ('filename' in source && source.filename) return source.filename
    if (source.type === 'url') return source.url.split('/').pop()?.split('?')[0]
    return undefined
  }

  protected onDestroy(): void {
    this.sheets = []
  }
}

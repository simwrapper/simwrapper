<template lang="pug">
.table-container
  vue-good-table.plugin-panel(v-if="isReady"
      data-testid="vue-good-table"
      :class="[globalState.isDarkMode ? 'darktable' : 'lighttable', hideHeader ? 'hide-header' : '', config.style, highlightClass, ...alignmentClasses]"
      :columns="columns"
      :rows="rows"
      :fixed-header="false"
      :max-height="maxHeight"
      :pagination-options="paginationOptions"
      styleClass="vgt-table striped bordered condensed")
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import 'vue-good-table-next/dist/vue-good-table-next.css'
import { VueGoodTable } from 'vue-good-table-next'

import globalStore from '@/store'
import { FileSystemConfig, Status } from '@/Globals'
import DashboardDataManager, { FilterDefinition } from '@/js/DashboardDataManager'

export default defineComponent({
  name: 'TablePanel',
  components: { VueGoodTable },
  props: {
    fileSystemConfig: { type: Object as PropType<FileSystemConfig>, required: true },
    subfolder: { type: String, required: true },
    files: { type: Array, required: true },
    config: { type: Object as any, required: true },
    cardTitle: { type: String, required: false },
    cardId: String,
    datamanager: { type: Object as PropType<DashboardDataManager>, required: true },
  },

  data: () => {
    return {
      globalState: globalStore.state,
      // dataSet is either x,y or allRows[]
      dataSet: {} as { x?: any[]; y?: any[]; allRows?: any },
      id: ('line-' + Math.floor(1e12 * Math.random())) as any,
      YAMLrequirementsLine: { dataset: '' },
      YAMLdeprecations: [],
      columns: [] as any[],
      rows: [] as any[],
      paginationOptions: {
        enabled: true,
        perPageDropdown: [] as any[],
        dropdownAllowAll: false,
        perPage: 5,
      },
      dataColumnNames: ['date'],
      percentColumnNames: ['percent'],
      hideHeader: undefined as any,
      isFullsize: false,
      alignmentClasses: [] as string[],
      isReady: false,
      // per-instance <style> element holding the cell highlight rules
      highlightStyleElement: null as HTMLStyleElement | null,
      highlightClass: '',
    }
  },
  async mounted() {
    this.dataSet = await this.loadData()
    this.setAlignmentClasses()
    this.prepareData()

    this.$emit('isLoaded')
    this.isReady = true
  },

  beforeUnmount() {
    this.datamanager?.removeFilterListener(
      { ...this.config, subfolder: this.subfolder },
      this.handleFilterChanged
    )
    this.highlightStyleElement?.remove()
    this.highlightStyleElement = null
  },

  computed: {
    maxHeight() {
      let h
      if (Number.isFinite(this.config?.height)) {
        h = `${60 * this.config.height}px`
      }
      return h
    },
  },

  methods: {
    handleFilterChanged() {
      if (!this.datamanager) return

      const { filteredRows } = this.datamanager.getFilteredDataset(this.config) as any

      if (!filteredRows || !filteredRows.length) {
        this.dataSet = { allRows: {} }
      } else {
        const allRows = {} as any

        const keys = Object.keys(filteredRows[0])
        keys.forEach(key => (allRows[key] = { name: key, values: [] as any }))

        filteredRows.forEach((row: any) => {
          keys.forEach(key => allRows[key].values.push(row[key]))
        })
        this.dataSet = { allRows }
      }
    },

    async loadData() {
      if (!this.files.length) return {}

      try {
        //this.validateYAML()
        let dataset = await this.datamanager.getDataset(this.config, {
          highPrecision: true,
          subfolder: this.subfolder,
        })
        if (dataset.comments?.length) this.$emit('comments', dataset.comments)

        // no filter? we are done
        if (!this.config.filters) return dataset

        // filter data before returning:
        this.datamanager.addFilterListener(
          { ...this.config, subfolder: this.subfolder },
          this.handleFilterChanged
        )

        for (const [column, value] of Object.entries(this.config.filters)) {
          const filter: FilterDefinition = {
            dataset: this.config.dataset,
            column: column,
            value: value,
            range: Array.isArray(value),
          }
          this.datamanager.setFilter(filter)
        }
        // empty for now; filtered data will come back later via handleFilterChanged async.
        return { allRows: {} }
      } catch (e) {
        this.$emit('error', `Error loading: ${this.subfolder}/${this.config.dataset}`)
        console.error('' + e)
      }
      return { allRows: {} }
    },

    validateYAML() {
      for (const key in this.YAMLrequirementsLine) {
        if (key in this.config === false) {
          this.$emit('error', {
            type: Status.ERROR,
            msg: `tablev2: missing required key: ${key}`,
            desc: JSON.stringify(this.config),
          })
        }
      }

      for (const deprecated of this.YAMLdeprecations) {
        if (this.config[deprecated]) {
          this.$emit('error', {
            type: Status.WARNING,
            msg: `tablev2: deprecated field: ${deprecated}`,
            desc: JSON.stringify(this.config),
          })
        }
      }
    },

    onlyNumbers(array: any[]) {
      return array.every(element => {
        return typeof element === 'number' || element == null
      })
    },

    onlyDates(array: any[]) {
      return array.every(element => {
        return element.length == 10 && element.split('-').length == 3
      })
    },

    columnFilterFn(data: any, filterString: string) {
      return data.toString().includes(filterString.toString())
    },

    setAlignmentClasses() {
      if (this.config.alignment) {
        for (let i = 0; i < this.config.alignment.length; i++) {
          if (this.config.alignment[i] == 'left') {
            this.alignmentClasses.push(`col-left-${i + 1}`)
          } else if (this.config.alignment[i] == 'center') {
            this.alignmentClasses.push(`col-center-${i + 1}`)
          } else if (this.config.alignment[i] == 'right') {
            this.alignmentClasses.push(`col-right-${i + 1}`)
          }
        }
      }
    },

    prepareData() {
      let numberOfValues = 0
      let data: any
      let numberColumns = [] as any[]
      let dateColumns = [] as any[]

      this.columns = []
      this.rows = []

      // if (this.config.style == 'topsheet' && this.hideHeader == undefined) {
      //   this.hideHeader = true
      // }

      // Create columns array for the header
      Object.entries(this.dataSet.allRows).forEach(([key, value]) => {
        // this issue tells us that fields with a dot in them require special handling
        // https://github.com/xaksis/vue-good-table/issues/593
        // field now either the key (string) or a function which returns row[key]
        let field: any = key
        if (field.indexOf('.') > -1) {
          field = (rowObject: any) => {
            return rowObject[key]
          }
        }

        this.columns.push({
          label: key.charAt(0).toUpperCase() + key.slice(1),
          field,
          originalField: key,
          hidden: false,
          filterOptions: {
            enabled: true,
            filterFn: this.columnFilterFn,
          },
        })
        data = value
        numberOfValues = data.values.length
      })

      // Add empty object for each row
      for (let i = 0; i < numberOfValues; i++) {
        this.rows.push({})
      }

      // Add the data to the row-array and check if all values of a column are numbers or dates
      Object.entries(this.dataSet.allRows).forEach(([key, value]) => {
        data = value
        if (this.onlyNumbers(data.values)) numberColumns.push(key)
        else if (this.onlyDates(data.values)) dateColumns.push(key)
        numberOfValues = data.values.length
        for (let i = 0; i < numberOfValues; i++) {
          this.rows[i][key] = data.values[i]
        }
      })

      // Set the format for the columns. Number, date or percentage (default: text)
      Object.values(this.columns).forEach(value => {
        if (numberColumns.includes(value.field))
          Object.assign(value, { type: 'number', tdClass: 'vgt-right-align-text-for-numbers' })
        if (dateColumns.includes(value.field) || this.dataColumnNames.includes(value.field)) {
          Object.assign(value, { type: 'date' })
          Object.assign(value, { dateInputFormat: 'yyyy-MM-dd' })
          Object.assign(value, { dateOutputFormat: 'yyyy-MM-dd' })
        }
        if (this.percentColumnNames.includes(value.field))
          Object.assign(value, { type: 'percentage' })
      })

      // Enable or disable filter options for the rows (YAML option: enableFilter: false/true)
      // The default is false
      for (let i = 0; i < this.columns.length; i++) {
        if (this.config.enableFilter) {
          this.columns[i].filterOptions.enabled = true
          this.columns[i].filterOptions.filterFn = this.columnFilterFn
        } else {
          this.columns[i].filterOptions.enabled = false
        }
      }

      const showSet = Array.isArray(this.config.show)
        ? new Set(this.config.show.map((s: string) => s.toString().toLowerCase()))
        : null

      const hideSet = Array.isArray(this.config.hide)
        ? new Set(this.config.hide.map((s: string) => s.toString().toLowerCase()))
        : null

      // Show/hide option (case-insensitiv)
      if (showSet || hideSet) {
        for (let i = 0; i < this.columns.length; i++) {
          const rawKey =
            (this.columns[i] as any).originalField ??
            (typeof this.columns[i].field === 'string' ? this.columns[i].field : '')
          const keyLc = rawKey.toString().toLowerCase()

          if (showSet) {
            // if show is defined: hide everything that is NOT in show
            this.columns[i].hidden = !showSet.has(keyLc)
          } else if (hideSet) {
            // if only hide is defined: hide everything that is in hide
            this.columns[i].hidden = hideSet.has(keyLc)
          }
        }
      }

      // Change Pagination Options Dropdown
      if (numberOfValues < 5) {
        this.paginationOptions.perPage = numberOfValues
        this.paginationOptions = {
          ...this.paginationOptions,
          perPageDropdown: [numberOfValues],
        }
      } else if (numberOfValues < 10) {
        this.paginationOptions = {
          ...this.paginationOptions,
          perPageDropdown: [5],
        }
      } else if (numberOfValues < 20) {
        this.paginationOptions = {
          ...this.paginationOptions,
          perPageDropdown: [5, 10],
        }
      } else {
        this.paginationOptions = {
          ...this.paginationOptions,
          perPageDropdown: [5, 10, 20],
        }
      }

      // Add settings for topsheet style
      if (this.config.style == 'topsheet') {
        this.hideHeader = true
        this.isFullsize = true
      }

      // Overwrite templates
      // Show/Hide header
      if (this.config.hideHeader != undefined) {
        this.hideHeader = this.config.hideHeader
      }

      if (
        this.isFullsize ||
        this.config.fullsize ||
        this.config.showAllRows ||
        this.config.showallrows ||
        this.config.showAllrows
      )
        this.paginationOptions.enabled = false

      if (numberOfValues < 5) this.paginationOptions.enabled = false

      this.applyCellHighlights()
    },

    // Parse a cell address into 0-based { col, row }. Accepts spreadsheet
    // notation ("A2", "AB10") or "col:1,row:2" (1-based, either order).
    parseCellAddress(address: string): { col: number; row: number } | null {
      const key = address.toString().trim()
      const a1 = key.match(/^([A-Za-z]+)(\d+)$/)
      if (a1) {
        let col = 0
        for (const ch of a1[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64)
        const row = parseInt(a1[2])
        return col > 0 && row > 0 ? { col: col - 1, row: row - 1 } : null
      }
      const col = key.match(/col\s*[:=]\s*(\d+)/i)
      const row = key.match(/row\s*[:=]\s*(\d+)/i)
      if (col && row) {
        const c = parseInt(col[1])
        const r = parseInt(row[1])
        return c > 0 && r > 0 ? { col: c - 1, row: r - 1 } : null
      }
      return null
    },

    // Convert "color:red; border:1px solid" (or a {color: 'red'} object) into
    // declarations marked !important, so they beat the dark/light/topsheet rules.
    parseCellCss(css: any): string[] {
      const entries: string[] =
        typeof css === 'object' && css !== null
          ? Object.entries(css).map(([k, v]) => `${k}:${v}`)
          : css.toString().split(';')

      return entries
        .map(d => d.replace(/[{}<>]/g, '').trim())
        .filter(d => d.includes(':'))
        .map(d => (/!important$/i.test(d) ? d : `${d} !important`))
    },

    // YAML "highlights" section: map of cell address -> CSS, e.g.
    //   highlights:
    //     A1: "color:red; background:darkblue"
    //     col:2,row:3: "font-weight:bold"
    applyCellHighlights() {
      const highlights = this.config.highlights
      if (!highlights || typeof highlights !== 'object') return
      // "col,row" -> CSS declarations
      const cellCss = new Map<string, string[]>()
      for (const [address, css] of Object.entries(highlights)) {
        const cell = this.parseCellAddress(address)
        if (!cell || css == null) {
          this.$emit('error', {
            type: Status.WARNING,
            msg: `table: invalid highlight cell "${address}"`,
            desc: 'Use spreadsheet notation like A2, or col:1,row:2',
          })
          continue
        }
        const key = `${cell.col},${cell.row}`
        cellCss.set(key, [...(cellCss.get(key) || []), ...this.parseCellCss(css)])
      }
      const prefix = `vgt-hl-${this.id}`
      const rules: string[] = []
      const classesByColumn = new Map<number, Map<number, string>>()

      for (const [key, declarations] of cellCss) {
        if (!declarations.length) continue
        const [col, row] = key.split(',').map(Number)
        const className = `${prefix}-c${col}-r${row}`
        rules.push(`.${prefix} .vgt-table td.${className} { ${declarations.join('; ')}; }`)
        if (!classesByColumn.has(col)) classesByColumn.set(col, new Map())
        classesByColumn.get(col)?.set(row, className)
      }

      // make sure cell borders don't bleed
      if (rules.length) {
        rules.unshift(
          `.${prefix} table.vgt-table { border-collapse: separate; border-spacing: 0; }`
        )
        this.highlightClass = prefix
      }

      const visibleColumns = this.columns.filter(c => !c.hidden)
      classesByColumn.forEach((rowClasses, col) => {
        const column = visibleColumns[col]
        if (!column) return
        const baseClass = typeof column.tdClass === 'string' ? column.tdClass : ''
        column.tdClass = (row: any) => {
          const cellClass = rowClasses.get(row.originalIndex)
          return cellClass ? `${baseClass} ${cellClass}`.trim() : baseClass
        }
      })

      if (!this.highlightStyleElement) {
        this.highlightStyleElement = document.createElement('style')
        this.highlightStyleElement.setAttribute('data-table-highlights', prefix)
        document.head.appendChild(this.highlightStyleElement)
      }
      this.highlightStyleElement.textContent = rules.join('\n')
    },
  },
})
</script>

<style lang="scss">
.darktable table.vgt-table {
  border: none;
}

.darktable .vgt-table thead th {
  color: var(--text);
  background-color: var(--bgMapPanel) !important;
  background: none;
  border: none;
}

.darktable .vgt-table.striped tbody tr:nth-of-type(odd) {
  background-color: #212121 !important;
}

.darktable .vgt-table.striped tbody tr:nth-of-type(even) {
  background-color: var(--bgMapPanel) !important;
}

.darktable .vgt-table.bordered td {
  // border-color: var(--bgMapPanel);
  border: none;
  color: var(--text);
}

.darktable .vgt-wrap__footer {
  background: none;
  border: none;
  color: var(--text);
}

.darktable .footer__row-count__select {
  color: var(--text);
}

.darktable .footer__navigation__page-info {
  color: var(--text);
}

.darktable .footer__navigation__page-btn {
  color: var(--text);
}

.darktable .vgt-input {
  height: 24px;
  font-size: 12px;
  color: var(--text);
  background-color: #212121;
  border: none;
}

.darktable .vgt-input::placeholder {
  color: var(--text);
}

// Lightmode Settings

.lighttable table.vgt-table {
  border: none;
}

.lighttable .vgt-table thead th {
  color: var(--text);
  background-color: var(--bgMapPanel) !important;
  background: none;
  border: none;
}

.lighttable .vgt-table.striped tbody tr:nth-of-type(odd) {
  background-color: #f6f6f6 !important;
}

.lighttable .vgt-table.striped tbody tr:nth-of-type(even) {
  background-color: var(--bgMapPanel) !important;
}

.lighttable .vgt-table.bordered td {
  // border-color: var(--bgMapPanel);
  border: none;
  color: var(--text);
}

.lighttable .vgt-wrap__footer {
  background: none;
  border: none;
  background-color: #f6f6f6;
  color: var(--text);
}

.lighttable .footer__row-count__select {
  color: var(--text);
}

.lighttable .footer__navigation__page-info {
  color: var(--text);
}

.lighttable .footer__navigation__page-btn {
  color: var(--text);
}

.lighttable .vgt-input {
  height: 24px;
  font-size: 12px;
  color: var(--text);
  background-color: #f6f6f6;
  border: none;
}

.lighttable .vgt-input::placeholder {
  color: var(--text);
}

.vgt-table th {
  padding: 0.4rem 0 0.4rem 0.75rem;
}

.vgt-wrap__footer {
  padding: 0.4rem;
}

.vgt-table,
.vgt-wrap__footer,
.footer__row-count__label,
.footer__row-count__select,
.footer__navigation__page-info,
.footer__navigation__page-btn span {
  font-size: 12px !important;
}

.vgt-pull-left {
  margin-top: 4px;
}

.vgt-table thead * {
  font-weight: 700;
}

.vgt-table th.sortable button:hover {
  cursor: pointer;
}

// Hide header
.hide-header .vgt-inner-wrap .vgt-responsive .vgt-table thead,
.hide-header .vgt-inner-wrap .vgt-fixed-header {
  display: none;
}

.topsheet .vgt-inner-wrap .vgt-responsive .vgt-table tbody tr td:not(:first-child) {
  text-align: left;
  font-weight: bold;
}

.topsheet .vgt-inner-wrap .vgt-responsive .vgt-table tbody tr {
  text-align: right;
}

.topsheet .vgt-inner-wrap .vgt-responsive .vgt-table tbody tr td {
  font-size: 1.1rem;
}

.col-left-1 .vgt-inner-wrap .vgt-responsive .vgt-table tbody tr td:nth-child(1) {
  text-align: left;
}

.col-left-2 .vgt-inner-wrap .vgt-responsive .vgt-table tbody tr td:nth-child(2) {
  text-align: left;
}

.col-left-3 .vgt-inner-wrap .vgt-responsive .vgt-table tbody tr td:nth-child(3) {
  text-align: left;
}

.col-left-4 .vgt-inner-wrap .vgt-responsive .vgt-table tbody tr td:nth-child(4) {
  text-align: left;
}

.col-left-5 .vgt-inner-wrap .vgt-responsive .vgt-table tbody tr td:nth-child(5) {
  text-align: left;
}

.col-left-6 .vgt-inner-wrap .vgt-responsive .vgt-table tbody tr td:nth-child(6) {
  text-align: left;
}

.col-left-7 .vgt-inner-wrap .vgt-responsive .vgt-table tbody tr td:nth-child(7) {
  text-align: left;
}

.col-left-8 .vgt-inner-wrap .vgt-responsive .vgt-table tbody tr td:nth-child(8) {
  text-align: left;
}

.col-left-9 .vgt-inner-wrap .vgt-responsive .vgt-table tbody tr td:nth-child(9) {
  text-align: left;
}

.col-left-10 .vgt-inner-wrap .vgt-responsive .vgt-table tbody tr td:nth-child(10) {
  text-align: left;
}

.col-center-1 .vgt-inner-wrap .vgt-responsive .vgt-table tbody tr td:nth-child(1) {
  text-align: center;
}

.col-center-2 .vgt-inner-wrap .vgt-responsive .vgt-table tbody tr td:nth-child(2) {
  text-align: center;
}

.col-center-3 .vgt-inner-wrap .vgt-responsive .vgt-table tbody tr td:nth-child(3) {
  text-align: center;
}

.col-center-4 .vgt-inner-wrap .vgt-responsive .vgt-table tbody tr td:nth-child(4) {
  text-align: center;
}

.col-center-5 .vgt-inner-wrap .vgt-responsive .vgt-table tbody tr td:nth-child(5) {
  text-align: center;
}

.col-center-6 .vgt-inner-wrap .vgt-responsive .vgt-table tbody tr td:nth-child(6) {
  text-align: center;
}

.col-center-7 .vgt-inner-wrap .vgt-responsive .vgt-table tbody tr td:nth-child(7) {
  text-align: center;
}

.col-center-8 .vgt-inner-wrap .vgt-responsive .vgt-table tbody tr td:nth-child(8) {
  text-align: center;
}

.col-center-9 .vgt-inner-wrap .vgt-responsive .vgt-table tbody tr td:nth-child(9) {
  text-align: center;
}

.col-center-10 .vgt-inner-wrap .vgt-responsive .vgt-table tbody tr td:nth-child(10) {
  text-align: center;
}

.col-right-1 .vgt-inner-wrap .vgt-responsive .vgt-table tbody tr td:nth-child(1) {
  text-align: right;
}

.col-right-2 .vgt-inner-wrap .vgt-responsive .vgt-table tbody tr td:nth-child(2) {
  text-align: right;
}

.col-right-3 .vgt-inner-wrap .vgt-responsive .vgt-table tbody tr td:nth-child(3) {
  text-align: right;
}

.col-right-4 .vgt-inner-wrap .vgt-responsive .vgt-table tbody tr td:nth-child(4) {
  text-align: right;
}

.col-right-5 .vgt-inner-wrap .vgt-responsive .vgt-table tbody tr td:nth-child(5) {
  text-align: right;
}

.col-right-6 .vgt-inner-wrap .vgt-responsive .vgt-table tbody tr td:nth-child(6) {
  text-align: right;
}

.col-right-7 .vgt-inner-wrap .vgt-responsive .vgt-table tbody tr td:nth-child(7) {
  text-align: right;
}

.col-right-8 .vgt-inner-wrap .vgt-responsive .vgt-table tbody tr td:nth-child(8) {
  text-align: right;
}

.col-right-9 .vgt-inner-wrap .vgt-responsive .vgt-table tbody tr td:nth-child(9) {
  text-align: right;
}

.col-right-10 .vgt-inner-wrap .vgt-responsive .vgt-table tbody tr td:nth-child(10) {
  text-align: right;
}

.col-right-11 .vgt-inner-wrap .vgt-responsive .vgt-table tbody tr td:nth-child(11) {
  text-align: right;
}

.col-right-12 .vgt-inner-wrap .vgt-responsive .vgt-table tbody tr td:nth-child(12) {
  text-align: right;
}

.col-right-13 .vgt-inner-wrap .vgt-responsive .vgt-table tbody tr td:nth-child(13) {
  text-align: right;
}
</style>

<style scoped lang="scss">
@use '@/variables' as *;
.table-container {
  position: relative;
  height: 100%;
  width: 100%;
  // overflow: hidden !important;
}

// Stay in normal flow. DashBoard gives `csv` cards no default height (see
// `defaultHeight` in DashBoard.vue) so the card sizes to this content; absolutely
// positioning the table contributes zero height and collapses the card to ~21px,
// which silently clips every row below the sticky header.
// When a card *does* pin a height, .dash-card-frame's own `overflow: auto` scrolls.
.plugin-panel {
  width: 100%;
  overflow: auto;
}

@media only screen and (max-width: 640px) {
}
</style>

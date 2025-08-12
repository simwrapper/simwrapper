<template lang="pug">
vue-good-table.plugin-panel(
      data-testid="vue-good-table"
      :class="[globalState.isDarkMode ? 'darktable' : 'lighttable', hideHeader ? 'hide-header' : '', this.config.style, ...this.alignmentClasses]"
      :columns="columns"
      :rows="rows"
      :fixed-header="true"
      :pagination-options="paginationOptions"
      styleClass="vgt-table striped bordered condensed")
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import 'vue-good-table/src/styles/style.scss'
import { VueGoodTable } from 'vue-good-table'

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
    }
  },
  async mounted() {
    this.dataSet = await this.loadData()
    this.setAlignmentClasses()
    this.prepareData()

    this.$emit('isLoaded')
  },

  beforeDestroy() {
    this.datamanager?.removeFilterListener(
      { ...this.config, subfolder: this.subfolder },
      this.handleFilterChanged
    )
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

      // Show/hide option
      if (Object.keys(this.config).includes('show') && Object.keys(this.config).includes('hide')) {
        for (let i = 0; i < this.columns.length; i++) {
          if (!this.config.show.includes(this.columns[i].field)) {
            this.columns[i].hidden = true
          }
        }
      } else if (Object.keys(this.config).includes('show')) {
        for (let i = 0; i < this.columns.length; i++) {
          if (!this.config.show.includes(this.columns[i].field)) {
            this.columns[i].hidden = true
          }
        }
      } else if (Object.keys(this.config).includes('hide')) {
        for (let i = 0; i < this.columns.length; i++) {
          if (this.config.hide.includes(this.columns[i].field)) {
            this.columns[i].hidden = true
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
    },
  },
})
</script>

<style lang="scss">
// Darkmode Settings

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
</style>

<style scoped lang="scss">
@import '@/styles.scss';
.plugin-panel {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  overflow: auto;
}

@media only screen and (max-width: 640px) {
}
</style>

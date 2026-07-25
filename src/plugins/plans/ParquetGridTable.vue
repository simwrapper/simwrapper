<template>
  <ag-grid-vue
    class="ag-theme-alpine"
    style="height: 600px; width: 100%"
    :columnDefs="columnDefs"
    :gridOptions="gridOptions"
    @grid-ready="onGridReady"
  />
</template>

<script>
import { AgGridVue } from 'ag-grid-vue3'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-alpine.css'

export default {
  components: { AgGridVue },
  props: {
    conn: { type: Object, required: true },
    tableName: { type: String, default: 'my_table' },
  },
  data() {
    return {
      columnDefs: [],
      pageSize: 100,
      gridOptions: {
        rowModelType: 'serverSide',
        pagination: true,
        paginationPageSize: 100,
        cacheBlockSize: 100,
        defaultColDef: { resizable: true, sortable: false },
      },
    }
  },
  async mounted() {
    await this.loadSchema()
  },
  methods: {
    async loadSchema() {
      const result = await this.conn.query(`DESCRIBE ${this.tableName}`)
      const cols = result.toArray().map(r => ({ column_name: r.column_name }))
      this.columnDefs = cols.map(c => ({
        field: c.column_name,
        filter: 'agTextColumnFilter',
        filterParams: { filterOptions: ['contains'] },
      }))
    },
    buildWhere(filterModel) {
      const entries = Object.entries(filterModel)
      const where = entries.length
        ? `WHERE ${entries.map(([col]) => `"${col}" ILIKE ?`).join(' AND ')}`
        : ''
      const params = entries.map(([, f]) => `%${f.filter}%`)
      return { where, params }
    },
    onGridReady(params) {
      params.api.setGridOption('serverSideDatasource', {
        getRows: async req => {
          const { where, params: sqlParams } = this.buildWhere(req.request.filterModel)
          const offset = req.request.startRow

          const dataStmt = await this.conn.prepare(`
            SELECT * FROM ${this.tableName}
            ${where}
            LIMIT ${this.pageSize} OFFSET ${offset}
          `)
          const dataResult = await dataStmt.query(...sqlParams)
          const rows = dataResult.toArray().map(r => r.toJSON())
          await dataStmt.close()

          const countStmt = await this.conn.prepare(`
            SELECT COUNT(*) AS c FROM ${this.tableName} ${where}
          `)
          const countResult = await countStmt.query(...sqlParams)
          const total = Number(countResult.toArray()[0].c)
          await countStmt.close()

          req.success({ rowData: rows, rowCount: total })
        },
      })
    },
  },
}
</script>

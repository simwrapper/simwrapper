<template lang="pug">
    vue-good-table(
      :columns="columns"
      :rows="rows"
      :fixed-header="true"
      :pagination-options="paginationOptions")
    </template>
    
    <script lang="ts">
    import { defineComponent } from 'vue'
    import type { PropType } from 'vue'
    
    import DashboardDataManager, { FilterDefinition } from '@/js/DashboardDataManager'
    import VuePlotly from '@/components/VuePlotly.vue'

    import 'vue-good-table/dist/vue-good-table.css'
    import { VueGoodTable } from 'vue-good-table';

    import { FileSystemConfig, Status, BG_COLOR_DASHBOARD, UI_FONT } from '@/Globals'
    import globalStore from '@/store'
    
    export default defineComponent({
      name: 'TablePanel',
      components: { VuePlotly, VueGoodTable},
      props: {
        fileSystemConfig: { type: Object as PropType<FileSystemConfig>, required: true },
        subfolder: { type: String, required: true },
        files: { type: Array, required: true },
        config: { type: Object as any, required: true },
        cardTitle: { type: String, required: true },
        cardId: String,
        datamanager: { type: Object as PropType<DashboardDataManager>, required: true },
      },
      data: () => {
        return {
          globalState: globalStore.state,
          // dataSet is either x,y or allRows[]
          dataSet: {} as { x?: any[]; y?: any[]; allRows?: any },
          id: ('line-' + Math.floor(1e12 * Math.random())) as any,
          YAMLrequirementsLine: { dataset: ''},
          YAMLdeprecations: [],
            columns: [] as any[],
            rows: [] as any[],
            paginationOptions: {
                enabled: true
            },
            dataColumnNames: ['date'],
            percentColumnNames: ['percent'],
        }
      },
    async mounted() {
        this.dataSet = await this.loadData()
        this.prepareData()
        
        this.$emit('isLoaded')
    },
  beforeDestroy() {
    this.datamanager?.removeFilterListener(this.config, this.handleFilterChanged)
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
        let dataset = await this.datamanager.getDataset(this.config)

        // no filter? we are done
        if (!this.config.filters) return dataset

        // filter data before returning:
        this.datamanager.addFilterListener(this.config, this.handleFilterChanged)

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
        console.error('' + e)
      }
      return { allRows: {} }
    },

    validateYAML() {
      console.log('in line validation')

      for (const key in this.YAMLrequirementsLine) {
        if (key in this.config === false) {
          this.$store.commit('setStatus', {
            type: Status.ERROR,
            msg: `line chart: missing required key: ${key}`,
            desc: JSON.stringify(this.config),
          })
        }
      }

      for (const deprecated of this.YAMLdeprecations) {
        if (this.config[deprecated]) {
          this.$store.commit('setStatus', {
            type: Status.WARNING,
            msg: `line chart: deprecated field: ${deprecated}`,
            desc: JSON.stringify(this.config),
          })
        }
      }
    },

    onlyNumbers(array: any[]) {
        return array.every(element => {
            return typeof element === 'number' || element == null;
        });
    },

    prepareData() {

        let numberOfValues = 0;
        let data: any
        let numberColumns = [] as any[]

        this.columns = []
        this.rows = []

        Object.entries(this.dataSet.allRows).forEach(
            ([key, value]) => {
                this.columns.push({label: key.charAt(0).toUpperCase() + key.slice(1), field: key, filterOptions: {
                    enabled: true
                },})
                data = value
                numberOfValues = data.values.length
            }
        );

        for (let i = 0; i < numberOfValues; i++) {
            this.rows.push({})
        }

        Object.entries(this.dataSet.allRows).forEach(
            ([key, value]) => {
                data = value

                if (this.onlyNumbers(data.values)) {
                    numberColumns.push(key)
                }

                numberOfValues = data.values.length
                for (let i = 0; i < numberOfValues; i++) {
                    this.rows[i][key] = data.values[i]
                } 
            }
        );

        Object.values(this.columns).forEach(
            (value) => {
                
                if (numberColumns.includes(value.field)) {
                    Object.assign(value, {type: 'number'});
                }

                if (this.dataColumnNames.includes(value.field)) {
                    Object.assign(value, {type: 'date'});
                    Object.assign(value, {dateInputFormat: 'yyyy-MM-dd'});
                    Object.assign(value, {dateOutputFormat: 'yyyy-MM-dd'});
                }

                if (this.percentColumnNames.includes(value.field)) {
                    Object.assign(value, {type: 'percentage'});
                }
            }
        );
    },
  },
    })
    </script>
    
    <style scoped lang="scss">
    @import '@/styles.scss';
    
    @media only screen and (max-width: 640px) {
    }
    </style>
    
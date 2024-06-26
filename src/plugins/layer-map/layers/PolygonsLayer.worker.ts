// Helper functions that do data processing in support of map layers
import * as Comlink from 'comlink'

import type { PolygonsDefinition } from './PolygonsLayer'

// import Coords from '@/js/Coords'
import { DataTable, DataTableColumn, DataType } from '@/Globals'
import ColorWidthSymbologizer, { Style } from '@/js/ColorsAndWidths'
import { LinesDefinition } from './LinesLayer'

// import { FillColorDefinition } from './FillColors.vue'

const myWorker = {
  cbStatus: null as any,
  boundaryJoinLookups: {} as { [column: string]: { [lookup: string | number]: number } },
  boundaryDataTable: {} as DataTable,
  numFeatures: 0,
  boundaryFilters: new Float32Array(0),
  dataLookupColumns: {} as DataTable,

  datasetIds: [] as string[],
  dataColumn: null as null | DataTableColumn,
  diffColumn: null as null | DataTableColumn,
  normalColumn: null as null | DataTableColumn,

  finalFillColors: '#888' as string | Uint8ClampedArray,

  // these are the settings defined in the UI
  currentUIFilterDefinitions: {} as any,
  currentUIFillColorDefinitions: {} as any,
  currentUILineColorDefinitions: {} as any,
  dataCalculatedValues: null as Float32Array | null,
  dataNormalizedValues: null as Float32Array | null,
  dataCalculatedValueLabel: '',
  // dataLineColors: '' as string | Uint8Array,
  // dataLineWidths: 1 as number | Float32Array,
  // dataPointRadii: 5 as number | Float32Array,
  // dataFillHeights: 0 as number | Float32Array,
  // constantLineWidth: null as null | number,

  buildFeatureLookup(joinColumn: string, joinValues: any[]) {
    // return it if we already built it
    if (this.boundaryJoinLookups[joinColumn]) return this.boundaryJoinLookups[joinColumn]

    try {
      this.statusUpdate('Joining datasets...')

      this.boundaryJoinLookups[joinColumn] = {}
      const lookupValues = this.boundaryJoinLookups[joinColumn]

      for (let i = 0; i < joinValues.length; i++) lookupValues[joinValues[i]] = i

      this.numFeatures = joinValues.length
      this.statusUpdate('')
      return lookupValues
    } catch (e) {
      console.warn('waahaa')
      return {}
    }
  },

  buildDatasetLookup(props: { joinColumns: string; dataColumn: DataTableColumn }) {
    // , dataTable: DataTable; datasetId: string; dataJoinColumns: string }) {

    const { joinColumns, dataColumn } = props
    console.log('> setupJoin', joinColumns, dataColumn)

    // if no join at all, don't do anything
    if (!joinColumns || joinColumns.indexOf(':') == -1) {
      console.log('NOT a VALID JOIN', joinColumns)
      return
    }

    // shapefilejoincol, datatablejoincol
    const [join1, join2] = joinColumns.split(':')

    // make sure columns exist!
    // if (!this.boundaryDataTable[this.featureJoinColumn])
    //   throw Error(`Geodata does not have property ${this.featureJoinColumn}`)
    // if (!dataTable[dataJoinColumn])
    //   throw Error(`Dataset ${datasetId} does not have column ${dataJoinColumn}`)

    // create lookup column and write lookup offsets
    const lookupDataColumn: DataTableColumn = {
      type: DataType.LOOKUP,
      values: [],
      name: `@@${join2}`,
    }

    const lookupValues = dataColumn.values

    const boundaryOffsets = this.boundaryJoinLookups[join1] // this.getBoundaryOffsetLookup(this.featureJoinColumn)
    console.log({
      boundaryjoinlookups: this.boundaryJoinLookups,
      offsets: boundaryOffsets,
    })

    // set lookup data
    for (let i = 0; i < lookupValues.length; i++) {
      const v = lookupValues[i]
      const featureOffset = boundaryOffsets[v]
      lookupDataColumn.values[i] = featureOffset
    }

    // save it
    this.dataLookupColumns[`@@${join2}`] = lookupDataColumn

    return lookupDataColumn

    // @@@@@@@@@@@@@@@@@@@@@@@

    // this.myDataManager.addFilterListener(
    //   { dataset: this.datasetKeyToFilename[datasetId] },
    //   this.processFiltersNow
    // )

    // this.prepareTooltipData(props)

    // // Notify Deck.gl of the new tooltip data
    // if (REACT_VIEW_HANDLES[1000 + this.layerId]) {
    //   REACT_VIEW_HANDLES[1000 + this.layerId](this.boundaries)
    // }
    // // console.log('triggering updates')
    // this.datasets[datasetId] = dataTable
  },

  buildColorArray(
    props: {
      numFeatures: number
      dataColumn: DataTableColumn | null
      normalColumn: DataTableColumn | null
      diffColumn: DataTableColumn | null
      options: PolygonsDefinition | LinesDefinition
      datasetIds: string[]
    },
    cbStatus: any
  ): string | Uint8ClampedArray {
    this.cbStatus = cbStatus
    this.numFeatures = props.numFeatures
    this.dataColumn = props.dataColumn
    this.diffColumn = props.diffColumn
    this.normalColumn = props.normalColumn
    this.datasetIds = props.datasetIds

    if (props.options.width) {
      this.handleNewLineColor(props.options)
    } else {
      this.handleNewFillColor(props.options)
    }

    return this.finalFillColors
  },

  statusUpdate(text: string) {
    if (this.cbStatus) this.cbStatus(text)
  },

  async processFiltersNow(datasetName?: string) {
    // This callback occurs when there is a newly filtered dataset.

    console.log('> processFiltersNow', datasetName)

    // TODO
    // const { filteredRows } = this.myDataManager.getFilteredDataset({ dataset: datasetName || '' })
    const filteredRows = [] as any

    const filteredDataTable: { [id: string]: DataTableColumn } = {}

    // if we got NULL, remove this filter totally
    if (filteredRows) {
      // turn array of objects into data columns for consumption by fill/line/height doodads
      // (do this here... or should this be somewhere else?)

      // CONVERT array of objects to column-based DataTableColumns
      const allColumns = filteredRows.length > 0 ? Object.keys(filteredRows[0]) : []
      allColumns.forEach(columnId => {
        const column = { name: columnId, values: [], type: DataType.UNKNOWN } as any
        for (const row of filteredRows) column.values.push(row[columnId])
        filteredDataTable[columnId] = column
      })

      // TEMPORARY: filter out any shapes that do not pass the test.
      // TODO: this will need to be revisited when we do layer-mode.

      // const lookups = this.getBoundaryOffsetLookup(this.featureJoinColumn)
      const lookups = {} as any

      // hide shapes not in filtered set
      const hideBoundary = new Float32Array(this.boundaryFilters.length)
      hideBoundary.fill(1)
      for (const row of filteredRows) {
        const joinText = '' // row[this.featureJoinColumn] // TODO BILLY
        const boundaryIndex = lookups[joinText]
        hideBoundary[boundaryIndex] = 0 // keep this one
      }
      // merge new hide/show with existing hide/show
      for (let i = 0; i < this.boundaryFilters.length; i++) {
        if (hideBoundary[i]) this.boundaryFilters[i] = -1
      }
    }

    try {
      // now redraw colors for fills and lines
      if (this.currentUIFillColorDefinitions?.dataset) {
        this.handleNewFillColor(
          filteredRows ? filteredDataTable : this.currentUIFillColorDefinitions
        )
      }
    } catch (e) {
      this.statusUpdate('error ' + e)
    }
  },

  // prepareTooltipData(props: { dataTable: DataTable; datasetId: string; dataJoinColumn: string }) {
  //   // if user wants specific tooltips based on this dataset, save the values
  //   // TODO - this is in the wrong place and probably causes problems with
  //   // survey-style multi-record datasets

  //   const { dataTable, datasetId, dataJoinColumn } = props

  //   const tips = this.vizDetails.tooltip || []
  //   const relevantTips = tips
  //     .filter(tip => tip.substring(0, tip.indexOf(':')).startsWith(datasetId))
  //     .map(tip => {
  //       return { id: tip, column: tip.substring(1 + tip.indexOf(':')) }
  //     })

  //   // no tips for this datasetId
  //   if (!relevantTips.length) return

  //   const lookupValues = dataTable[dataJoinColumn].values
  //   const boundaryOffsets = this.getBoundaryOffsetLookup(this.featureJoinColumn)

  //   for (const tip of relevantTips) {
  //     // make sure tip column exists
  //     if (!dataTable[tip.column]) {
  //       this.$emit('error', `Tooltip references "${tip.id}" but that column doesn't exist`)
  //       continue
  //     }

  //     // set the tooltip data
  //     for (let i = 0; i < lookupValues.length; i++) {
  //       const featureOffset = boundaryOffsets[lookupValues[i]]
  //       const feature = this.boundaries[featureOffset]
  //       const value = dataTable[tip.column].values[i]
  //       if (feature) feature.properties[tip.id] = value
  //     }
  //   }
  // },

  paintColorsWithFilter(section: string, dataTable: DataTable) {
    const currentDefinition =
      section === 'fill'
        ? this.currentUIFillColorDefinitions
        : this.currentUILineColorDefinitions

    const columnName = currentDefinition.columnName
    const lookupColumn =
      currentDefinition.join === '@count'
        ? dataTable[`@@${columnName}`]
        : dataTable[`@@${currentDefinition.join}`]

    let normalColumn
    if (currentDefinition.normalize) {
      const keys = currentDefinition.normalize.split(':')
      this.dataCalculatedValueLabel = columnName + '/' + keys[1]
      const datasetKey = currentDefinition.dataset

      // if (!this.datasets[keys[0]] || !this.datasets[keys[0]][keys[1]]) {
      //   throw Error(`Dataset ${datasetKey} does not contain column "${columnName}"`)
      // }
      normalColumn = dataTable[keys[1]]
    }

    const props = {
      numFeatures: this.numFeatures,
      data: dataTable[columnName],
      lookup: lookupColumn,
      normalColumn,
      filter: this.boundaryFilters,
      options: currentDefinition,
      join: currentDefinition.join,
    }

    const { rgbArray, legend, calculatedValues } =
      ColorWidthSymbologizer.getColorsForDataColumn(props)

    if (!rgbArray) return

    if (section === 'fill') {
      this.finalFillColors = rgbArray
    }

    this.dataCalculatedValues = calculatedValues

    // this.legendStore.setLegendSection({
    //   section: section === 'fill' ? 'FillColor' : 'Line Color',
    //   column: columnName,
    //   values: legend,
    // })
  },

  handleNewFillColor(fillOrFilteredDataTable: PolygonsDefinition | DataTable) {
    // *** FILTER: if prop has a metric, then this is a FillColorDefinition
    const isFillColorDefinition = 'metric' in fillOrFilteredDataTable
    const isFilterTable = !isFillColorDefinition

    // If we received a new fill color definition AND the dataset is filtered,
    // then bookmark that definition and process the filter first/instead.
    // (note, processFiltersNow() will call this function again once the calcs are done)

    // TODO BILLY - filters
    // if (isFillColorDefinition) {
    //   const definition: PolygonsDefinition = fillOrFilteredDataTable as any
    //   const dataset = definition.metric
    //   const { filteredRows } = this.myDataManager.getFilteredDataset({
    //     dataset: `${dataset}` || '',
    //   })
    //   if (filteredRows && filteredRows.length) {
    //     this.currentUIFillColorDefinitions = fillOrFilteredDataTable
    //     this.processFiltersNow(dataset)
    //     return
    //   }
    // }

    if (isFilterTable) {
      this.paintColorsWithFilter('fill', fillOrFilteredDataTable)
      return
    }

    const color = fillOrFilteredDataTable as PolygonsDefinition
    this.currentUIFillColorDefinitions = color

    const [datasetKey, columnName] = color.metric.split(':')

    // if (color.diffDatasets) {
    //   // *** diff mode *************************
    //   // TODO
    //   // this.handleColorDiffMode('fill', color)
    //   return
    // }

    if (!columnName) {
      console.error('NO COLUMN NAME')
      // // *** simple color **********************
      // this.dataFillColors = color.fixedColors[0]
      // this.dataCalculatedValueLabel = ''
      // this.legendStore.clear('FillColor')
      return
    }

    // *** Data column mode *************************************************************
    this.dataCalculatedValueLabel = columnName ?? ''

    // Do we need a join? Join it
    let dataJoinColumn = ''
    if (color.join && color.join !== '@count') {
      // join column name set by user
      dataJoinColumn = color.join
    } else if (color.join === '@count') {
      // rowcount specified: join on the column name itself
      dataJoinColumn = columnName
    } else {
      // nothing specified: let's hope they didn't want to join
      if (this.datasetIds.length > 1) {
        console.warn(
          'No join; lets hope user just wants to display data in boundary file'
        )
      }
    }

    // NORMALIZE if we need to
    let normalLookup

    if (color.normalize) {
      const [dataset, column] = color.normalize.split(':')
      this.dataCalculatedValueLabel += `/ ${column}`

      // TODO Create a join for the normal column if it's not from the featureset itself
      const [j1, j2] = dataJoinColumn.split(':')
      normalLookup = this.dataLookupColumns[`@@${j2}`]
    }

    const ramp = {
      ramp: color.colorRamp?.ramp || 'Viridis',
      style: color.colorRamp?.style || Style.sequential,
      reverse: color.colorRamp?.reverse || false,
      steps: color.colorRamp?.steps || 9,
      breakpoints: color.colorRamp?.breakpoints || undefined,
    }

    const [j1, j2] = dataJoinColumn.split(':')
    const lookup = this.dataLookupColumns[`@@${j2}`]

    // Calculate colors for each feature
    const { rgbArray, legend, calculatedValues } =
      ColorWidthSymbologizer.getColorsForDataColumn({
        numFeatures: this.numFeatures,
        data: this.dataColumn as any,
        data2: this.diffColumn as any,
        normalColumn: this.normalColumn as any,
        normalLookup,
        lookup,
        lookup2: this.diffColumn ? lookup : undefined,
        filter: this.boundaryFilters,
        options: { colorRamp: ramp, fixedColors: color.fixedColors },
        join: color.join,
        relative: color.relative,
      })

    if (rgbArray) {
      this.finalFillColors = rgbArray
      this.dataCalculatedValues = calculatedValues
      this.dataNormalizedValues = calculatedValues || null

      // TODO BILLY - legends

      // this.legendStore.setLegendSection({
      //   section: 'FillColor',
      //   column: dataColumn.name,
      //   values: legend,
      //   normalColumn: normalColumn ? normalColumn.name : '',
      // })
    }
  },

  handleNewLineColor(fillOrFilteredDataTable: LinesDefinition | DataTable) {
    // *** FILTER: if prop has a metric, then this is a FillColorDefinition
    const isLinesColorDefinition = 'width' in fillOrFilteredDataTable
    const isFilterTable = !isLinesColorDefinition

    // If we received a new fill color definition AND the dataset is filtered,
    // then bookmark that definition and process the filter first/instead.
    // (note, processFiltersNow() will call this function again once the calcs are done)

    // TODO BILLY - filters
    // if (isFillColorDefinition) {
    //   const definition: PolygonsDefinition = fillOrFilteredDataTable as any
    //   const dataset = definition.metric
    //   const { filteredRows } = this.myDataManager.getFilteredDataset({
    //     dataset: `${dataset}` || '',
    //   })
    //   if (filteredRows && filteredRows.length) {
    //     this.currentUIFillColorDefinitions = fillOrFilteredDataTable
    //     this.processFiltersNow(dataset)
    //     return
    //   }
    // }

    if (isFilterTable) {
      this.paintColorsWithFilter('fill', fillOrFilteredDataTable)
      return
    }

    const lineDef = fillOrFilteredDataTable as LinesDefinition
    this.currentUILineColorDefinitions = lineDef

    const [datasetKey, columnName] = lineDef.color.split(':')

    // if (color.diffDatasets) {
    //   // *** diff mode *************************
    //   // TODO
    //   // this.handleColorDiffMode('fill', color)
    //   return
    // }

    if (!columnName) {
      console.error('NO COLUMN NAME')
      // // *** simple color **********************
      // this.dataFillColors = color.fixedColors[0]
      // this.dataCalculatedValueLabel = ''
      // this.legendStore.clear('FillColor')
      return
    }

    // *** Data column mode *************************************************************
    this.dataCalculatedValueLabel = columnName ?? ''

    // Do we need a join? Join it
    let dataJoinColumn = ''
    if (lineDef.join && lineDef.join !== '@count') {
      // join column name set by user
      dataJoinColumn = lineDef.join
    } else if (lineDef.join === '@count') {
      // rowcount specified: join on the column name itself
      dataJoinColumn = columnName
    } else {
      // nothing specified: let's hope they didn't want to join
      if (this.datasetIds.length > 1) {
        console.warn(
          'No join; lets hope user just wants to display data in boundary file'
        )
      }
    }

    // NORMALIZE if we need to
    let normalLookup

    if (lineDef.normalize) {
      const [dataset, column] = lineDef.normalize.split(':')
      this.dataCalculatedValueLabel += `/ ${column}`

      // TODO Create a join for the normal column if it's not from the featureset itself
      const [j1, j2] = dataJoinColumn.split(':')
      normalLookup = this.dataLookupColumns[`@@${j2}`]
    }

    const ramp = {
      ramp: lineDef.colorRamp?.ramp || 'Viridis',
      style: lineDef.colorRamp?.style || Style.sequential,
      reverse: lineDef.colorRamp?.reverse || false,
      steps: lineDef.colorRamp?.steps || 9,
      breakpoints: lineDef.colorRamp?.breakpoints || undefined,
    }

    const [j1, j2] = dataJoinColumn.split(':')
    const lookup = this.dataLookupColumns[`@@${j2}`]

    // Calculate colors for each feature
    const { rgbArray, legend, calculatedValues } =
      ColorWidthSymbologizer.getColorsForDataColumn({
        numFeatures: this.numFeatures,
        data: this.dataColumn as any,
        data2: this.diffColumn as any,
        normalColumn: this.normalColumn as any,
        normalLookup,
        lookup,
        lookup2: this.diffColumn ? lookup : undefined,
        filter: this.boundaryFilters,
        options: { colorRamp: ramp, fixedColors: lineDef.fixedColors },
        join: lineDef.join,
        relative: lineDef.relative,
      })

    if (rgbArray) {
      this.finalFillColors = rgbArray
      this.dataCalculatedValues = calculatedValues
      this.dataNormalizedValues = calculatedValues || null

      // TODO BILLY - legends

      // this.legendStore.setLegendSection({
      //   section: 'FillColor',
      //   column: dataColumn.name,
      //   values: legend,
      //   normalColumn: normalColumn ? normalColumn.name : '',
      // })
    }
  },
}

Comlink.expose(myWorker)

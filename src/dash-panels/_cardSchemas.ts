// Don't put card schema definitions in the dash-panel .vue files, because those are
// read in async on an as-needed basic. (Helps a ton with startup time).
// So for now, schema definitions go here.

// -----------------------
export interface CardDefinition {
  type: String
  label: String
  label_de?: String
  entries: CardField[]
}

export interface CardField {
  id: String
  type: String
  label?: String
  label_de?: String
  hint?: String
  required: Boolean
}

// -----------------------
// All cards have these standard definitions
const standardEntries: CardField[] = [
  { id: 'title', type: 'text', label: 'Title', label_de: 'Titel', required: false },
  // { id: 'description', type: 'text', label: 'Sub-title', required: false },
  // { id: 'width', type: 'number', label: 'Panel Width', required: false },
]

// -----------------------
// The basic plotly charts all have these definitions
const basicPlotly: CardField[] = [
  {
    id: 'dataset',
    type: 'text',
    label: 'Dataset, folder, or URL',
    required: true,
    hint: 'Filename or URL of the dataset. Files can include the relative path to this folder',
  },
  {
    id: 'x',
    type: 'text',
    label: 'X-Data column',
    required: true,
    hint: 'Column name containing data to be plotted on the x-dimension',
  },
  {
    id: 'xAxisName',
    type: 'text',
    label: 'X-Axis label',
    required: false,
    hint: 'Column names are used if this is omitted',
  },
  {
    id: 'yAxisName',
    type: 'text',
    label: 'Y-Axis label',
    required: false,
    hint: 'Column names are used if this is omitted',
  },
  {
    id: 'legendTitles',
    type: 'text',
    label: 'Legend Text',
    required: false,
    hint: 'Comma-separated titles for each data column for use in the chart legend. Column names are used if this is omitted',
  },
  {
    id: 'useLastRow',
    type: 'boolean',
    label: 'Display last row only',
    required: false,
    hint: 'Some datasets such as iteration statistics only have useful data in the final row',
  },
]

const DEFINITIONS: { [id: string]: CardDefinition } = {
  area: {
    type: 'area',
    label: 'Area chart',
    entries: [...standardEntries, ...basicPlotly],
  },
  bar: {
    type: 'bar',
    label: 'Bar chart',
    entries: [
      ...standardEntries,
      ...basicPlotly,
      {
        id: 'stacked',
        type: 'boolean',
        label: 'Stack bar charts',
        required: false,
        hint: 'Use plotly "stacked:true" for this chart',
      },
    ],
  },
  line: {
    type: 'line',
    label: 'Line chart',
    entries: [...standardEntries, ...basicPlotly],
  },
  pie: {
    type: 'pie',
    label: 'Pie chart',
    entries: [
      ...standardEntries,
      {
        id: 'dataset',
        type: 'text',
        label: 'Dataset, folder, or URL',
        required: true,
        hint: 'Filename or URL of the dataset. Files can include the relative path to this folder',
      },
      {
        id: 'useLastRow',
        type: 'boolean',
        label: 'Display last row only',
        required: false,
        hint: 'Some datasets such as iteration statistics only have useful data in the final row',
      },
      {
        id: 'ignoreColumns',
        type: 'text',
        required: false,
        label: 'Ignore columns',
        hint: 'Comma,separated,list of columns to leave out (e.g. Iteration)',
      },
    ],
  },
  scatter: {
    type: 'scatter',
    label: 'Scatter plot',
    entries: [
      ...standardEntries,
      ...basicPlotly,
      {
        id: 'y',
        type: 'text',
        label: 'Y-Data column',
        required: true,
        hint: 'Data column with y values',
      },
    ],
  },
}

export default DEFINITIONS

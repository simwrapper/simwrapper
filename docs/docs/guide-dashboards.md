---
id: guide-dashboards
title: 2. Dashboards in depth
---

A dashboard is a page laid out with multiple charts, plots, and visualizations all together. You define the layout with a YAML configuration file which contains the types of plots and their configurations all in one place.

![Dashboard example](assets/dashboard.jpg)
_Dashboards usually show several at-a-glance summary metrics._

A folder containing any number of `dashboard-*` YAML files show the dashboard instead of the usual folder browser view. When multiple dashboard YAML files exist, they will be shown as multiple navigation tabs on the page.

## Defining a dashboard

Start with the example below and edit as necessary. YAML is _extremely picky_ about white space and indentation, like Python. Be careful!

### Header

A dashboard requires a top-level `header` containing _tab_ and _title_ and optional _description._

```yaml
header:
  tab: 'Summary'
  title: 'Top-Level Summary Statistics'
  description: 'At-a-glance figures we usually look at' #optional
```

### Layout

Below the header, a dashboard also requires a `layout` section which defines a set of named **rows**. The row name themselves are not displayed anywhere; they are just there to help you organize the file.

**row**: Each `row` can contain either (1) the properties of a full-width panel, or (2) a YAML **list** of properties for panels that will be laid out horizontally in the row. YAML lists have a strange syntax with `-` hyphens marking the beginning of a list item. It's best to just look at the example below.

By default, multiple panels are laid out from left to right, in equal widths. (But see _width_ option further below)

```yaml
layout:
  myRow1: # this row has one full-width chart
    type: bar
    title: 'My Bar Chart'
    dataset: mycsvdata.csv
    # ...

  # next row has two charts, using the '-' YAML list syntax
  myMultiRow:
    - type: bar
      title: 'My Bar Chart'
      dataset: mycsvdata.csv
      # ...

    - type: table
      title: 'My Summary Table'
      config: summary-table.yaml
```

That indentation in the example above is extremely important! Indentation is how YAML interprets the grouping of elements.

**Chart/plot details:** Each element in a row has the following properties. This defines the actual chart that will be displayed.

- **type** Required: the chart or plot type, e.g. `pie`, `bar`, `flowmap`, etc. See the individual chart docs for all available plots.
- **title** The name of the plot
- **description** A brief description (optional)
- **height** You can set _relative height_ by adding the `height:` parameter (default: 5)
- **width** You can set _relative widths_ by adding the `width: [number]` property. Panels have a default width of 1. Thus in a row with 3 charts, if the width of the first object is 2, then [2+1+1] means the first object fills 50% of the row, and the remaining two objects fill 25% each. (default: 1)
- **Other properties** Every viz type has its own set of properties. Include those as separate `key: value` lines in the configuration, as needed. See the individual chart docs in the API Reference; _The chart type determines the set of valid properties!_

## Example: dashboard-summary.yaml

Here is a full example dashboard, pulling all of the above together. Note especially the indentation and the use of `-` to denote YAML lists.

```yaml
header:
  tab: Summary
  title: My Summary Dashboard
  description: 'Examples of various chart types'

layout:
  row1: # this row has two charts
    - title: 'Mode Share - Final'
      description: 'From modestats.txt summary'
      type: 'pie'
      width: 1
      dataset: '*modestats.txt'
      useLastRow: true
      ignoreColumns: ['Iteration']

    - title: 'Example Bar Plot'
      description: 'Distance over Iteration'
      type: 'bar'
      width: 2
      usedCol: [distance_m_mean, directDistance_m_mean]
      legendName: [Distance (mean), Direct Distance (mean)]
      skipFirstRow: true
      dataset: '*drt_customer_stats_drt_short.csv'
      x: 'iteration'
      yAxisName: 'Distanz'
      xAxisName: 'Iteration'

  secondRow: # this row has just one plot
    title: 'Example Line Plot'
    description: 'Distance over Iteration'
    type: 'line'
    width: 1
    usedCol: [distance_m_mean, directDistance_m_mean]
    legendName: [Distance (mean), Direct Distance (mean)]
    skipFirstRow: false
    dataset: '*drt_customer_stats_drt.csv'
    x: 'iteration'
    yAxisName: 'Distance'
    xAxisName: 'Iteration'
```

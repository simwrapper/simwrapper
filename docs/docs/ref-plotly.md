---
id: plotly
title: Plotly
---

![plotly example](assets/plotly.png)
_Plotly_

With the Plotly plug-in it is possible to create your own plug-ins in addition to the standard ones.

## Usage

The plotly plug-in can be used to add panels in **Dashboards**. See Dashboard documentation for general tips on creating dashboard configurations.

- Each plotly panel is defined inside a **row** in a `dashboard-*.yaml` file.
- Use panel `type: plotly` in the dashboard configuration.
- Standard title, description, and width fields define the frame.

---

### Sample dashboard.yaml config snippet

```yaml
layout:
  row1:
    - type: 'plotly'
      title: Example Title
      dataset: 'data.csv'
```

---

### Plotly properties

Plotly plug-in properties:

**colorRamp:** String. Set the color ramp that is applied if multiple traces are present.

**mergeDatasets:** Boolean. Merge all given datasets into one.

**fixedRatio:** Boolean. Define a fixed ratio for x and y axes domain.

**dropdownMenu:** Boolean. Create dropdown menu for individual traces.

**multiIndex:** Map<String, String>. Merge two column as index. Column name as key will be merged with the column name value. This allows to build level multi indices for certain plot types.

**traces:** List<Trace>. TODO

**data:** List<DataSet>. TODO

---

### Detailed example

To generate the plot from the title image, the following code was used. The .csv file does not contain all the data, but is only meant to explain the structure.

```yaml
arrivals:
  - type: plotly
    title: Departures
    description: by hour and purpose
    datasets:
      dataset: analysis/population/trip_purposes_by_hour.csv
    traces:
    - x: $dataset.h
      "y": $dataset.arrival
      orientation: v
      type: bar
      name: $dataset.purpose
      colorRamp: Spectral
    layout:
      xaxis:
        title: Hour
        color: '#444'
        type: '-'
      barmode: stack
      yaxis:
        title: Share
        color: '#444'
        type: '-'
```

|   purpose      |   h   |         arrival           |         departure        |
|:--------------:|:------|:-------------------------:|:-------------------------|
| accomp_children|   9   |    0.0                    | 2.587991718426501E-4    |
| accomp_children|   10  |    2.587991718426501E-4  | 0.0                     |
| ...            |  ...  |    ...                    | ...                     |
| business       |   3   |    2.587991718426501E-4  | 5.175983436853002E-4    |
| business       |   4   |    0.0010351966873706005| 7.763975155279503E-4    |
| ...            |  ...  |    ...                    | ...                     |
| educ_higher    |   6   |    2.587991718426501E-4  | 2.587991718426501E-4    |
| educ_higher    |   7   |    2.587991718426501E-4  | 5.175983436853002E-4    |


---
id: area-maps
title: Area Maps
---

![Examples of choropleth and dot-size maps](assets/area-maps.jpg)
_(1) Area map with "choropleth" color-filled areas; (2) Area map with circles instead of filled areas_

### Aggregate area maps and dot-size maps

Area maps with filled colors are excellent for depicting spatial data in one dimension.

Note that very large and very small areas on the same maps can create misleading visualizations; in this case it may be best to normalize data by area before plotting it. Alternatively, the circle-plots show exactly the same data in a different manner.

**NOTE** Both plots are created using the same configuration below. Click the UI button below the maps to switch between the two views.

## Usage

**Standalone:** Create a `viz-map*.yaml` file as described below

-or-

**Embed in Dashboard:** Create a `dashboard-*.yaml` file and include a `type: map` section as described below.

- Each area map panel is defined inside a **row** in a `dashboard-*.yaml` file.
- Use panel type `map` in the dashboard configuration. (Note this may change in the future as we add more map types)
- Standard title, description, and width fields define the frame.
- See [Dashboard documentation](dashboards) for general tips on creating dashboard configurations.

---

### Configuration reference properties

NOTE: These properties all go into a `viz-map*.yaml` file as-is, or in a dashboard file they all go under the `props:` section of a layout row. See the examples at the end of this document.

```yaml
title: "Area map example: DRT vehicles"
description: "DRT Trips by PLZ Code"
center: [6.9814, 51.57]
zoom: 10
pitch: 0
bearing: 0
```
All of these properties are optional. 

- **title:** (optional) title of the visualization, appears right on top of the map. In the case of a dashboard: if a title is specified both under `general` and under `props`, the one under `general` will be used.

- **description:** (optional) description of the visualization, appears between title and map. In the case of a dashboard: if a description is specified both under `general` and under `props`, the one under `general` will be used.

- **center:** (optional) coordinates that the map centers on. Can be provided as array or string. If it is not provided, a center is calculated using a sampling of the data.

- **zoom:** (optional) zoom level of the map between 5 and 20. If it is not provided, the zoom level 9 is used.

- **pitch:** (optional) If it is not provided, the pitch is 0.

- **bearing:** (optional) If it is not provided, the bearing is 0.


### **shapes:** the boundaries/areas to be drawn

There are **two separate data types** loaded for an area map: one for the boundaries/shapes, and one for the dataset.

Joining data: Both files must contain an matching identification column in order to join the two datasets together. In other words, the boundary IDs must be present (somwhere) in both datafiles. The names of the columns can be different in the two files; see below.

```yaml
shapes:
  file: my-taz-shapefile.shp
  join: id
```

Contains two subentries:

- **file:** String. The filepath containing the data. May include wildcards \* and ?. File can be in _geojson_ format, or a _shapefile_. File type is determined by suffix, so must end in either `.geojson` or `.shp` When loading shapefiles, an identically-named .dbf and .prj file will also be read from the same folder. Be sure to supply a .prj file containing a valid EPSG code if your data is not in lat/long format.
- **join:** String. The name of the data column containing shape IDs, or 'id' if it is in the id field of geojson.

### **datasets:** the dataset to be joined to the shapefile

```yaml
dataset:
  transit-trips:
    file: .summaries/transit-outputs.csv
    join: TAZ
```

Contains an object naming the dataset and providing its filename and join column:

- **name of dataset:** Give the dataset a simple name, which will be used in the display settings below. e.g. `tazdata`
  - **file:** String. The filepath containing the data. May include wildcards \* and ?. File can be in _CSV or DBF_ format. Any filename not ending in `.dbf` will be parsed as a CSV file, using either commas, tabs, or spaces as delimiters.
  - **join:** String. The name of the data column containing the shape IDs for joining.

### **display:** define the color and value details

For area maps, the `fill` section defines the color fill, and is (currently) the only section that is required. At a later date we may include borders, etc.

```yaml
display:
  fill:
    dataset: transit-trips
    filters: operator, income
    columnName: trip_origins, trip_boards, trip_reslocs
    colorRamp:
      ramp: Plasma
      reversed: true
      steps: 5
```

**dataset:** Name of the dataset from above which includes the data.

**filters:** (optional) List of any columns which can be used as category filters by the user interactively. Note that _active filters_ will be shown in the URL bar, so curated maps can be shared via URL.

**columnName:** The column name (or names) containing values to be plotted. If multiple rows have a matching shape ID, all values will be summed together. (Other stats to be added)

**colorRamp:** Describe the colors themselves:

- **ramp:** Name of the color ramp to use.
  - Sequential: `Viridis` `Plasma` `Blues` `Greens` `Purples` `Oranges`
  - Diverging: `PRGn` `RdBu`
  - Categorical: `Tableau10` `Paired`. Note categoricals only have ten or twelve categories.
- **reversed:** true/false
- **steps:** Number of steps in the ramp.
- **exponentColors:** Optional true/false. If true, values will be scaled exponentially before being drawn. This is often useful if values are concentrated in small areas, and much higher in value than in typical areas.

---

## YAML configuration examples

### Sample viz-map-1.yaml configuration

```yaml
title: 'VIZ-MAP 1'
description: 'All day transit usage'
center: [6.9814, 51.57]
zoom: 10
shapes:
  file: '../../shapefiles/geoid.geojson'
  join: id
datasets:
  transit-trips:
    file: .dashboard/transit-data.csv
    join: geoid
display:
  fill:
    dataset: transit-trips
    filters: operator, income
    columnName: trip_origins, trip_boards, trip_reslocs
    colorRamp:
      ramp: Plasma
      steps: 7
```

### Sample dashboard-1.yaml dashboard with an area map

```yaml
header:
  title: 'Trip Destinations'
  description: 'All day'

layout:
  row:
    - type: map
      height: 10
      props:
        title: 'VIZ-MAP 1'
        description: 'All day transit usage'
        center: [6.9814, 51.57]
        zoom: 10
        shapes:
          file: '../../shapefiles/geoid.geojson'
          join: id
        datasets:
          transit-trips:
            file: .dashboard/transit-data.csv
            join: geoid
        display:
          fill:
            dataset: transit-trips
            filters: operator, income
            columnName: trip_origins, trip_boards, trip_reslocs
            colorRamp:
              ramp: Plasma
              steps: 7
```

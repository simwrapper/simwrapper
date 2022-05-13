# Shapefile Viz: Some notes

### Files:

- All feature types supported: lines, polygons, points, multi-\*
- **GeoJSON** and **Shapefile (.shp)** file types can both be read;
- GeoJSON is expected to be in **long/lat** already, while shapefiles can have a `.prj` file containing the projection, or the config can specify a projection; or we will ask the user

---

### Symbology:

Features can be painted based on properties or joined data.

- Polygons can have **fill color**,
- Lines can have **color** and **width**
- Points can have **color** and **radius**
- Symbology can be **categorical** or **numerical** with various breakpoints and scaling options. Examples:
  - Link-bandwidth plots where width represents volume; color represents facility type
  - Delay plots where width is by facility type and color is delay or speed etc

---

### Joined datasets:

- Datasets can be joined to features, based on a common join column (which can be named anything)

- Multiple datasets are supported

---

### Filtering data:

- Some **datasets** have **multiple rows per feature**, such as zonal ridership by transit agency; allow user to show total or filter some/all/none based on column data

- Some **features** may be filtered OUT based on data; such as hiding zone-centroid links

---

### Implementation:

- Need to modify deck.gl LineLayer to handle left/right bandwidths

- Move shapefile/geojson **properties** into a separate "dataset" and leave the properties of each element blank, because tests show this is more performant. Also helps to make the UI of selecting symbology more consistent.

- Pass **separate arrays** into the deck.gl layer for each of
  `fillColor`, `lineColor`, `lineWidth`, `pointRadius`. And `opacity` too?

- Use **d3 functions** to determine color ramps, width buckets, etc.

- **Filtering:**
  - hide features based on properties (centroid links)
  - filter datasets (trips to downtown only; BART trips)

### Issues / Considerations

- Add a default dataset containing the **feature properties**

- The bottom-side filter and selection thingies are nice but hard to set up. User probably doesn't just want to switch the colors but also the widths. Probably full set changes. Need to think about this.

- The data loader is impossibly complicated. It would probably have been easier to just do Papaparse.parse({guess: true}). Is it too late?

### Choosing colors, bins, etc with D3

Right now the color code is embedded in the link and area map layers, which is nuts. Let's refactor and do it right:

- User selects a data column for the fill color / line color / line width.
- Extract the d3 code from those layers and put it into a ColorGenerator
- While we're here, let's do the binning and user-specified breakpoints
- And the exponent/sqrt/log

- The column could be categorical, in which case we can still use D3 but need to research how to do it.

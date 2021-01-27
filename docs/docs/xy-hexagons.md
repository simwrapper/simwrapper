---
id: xy-hexagons
title: XY Hexagons
---

![xy hexagon banner](assets/xy-hexagons.jpg)
_Origin/Destination summary_

Count the number of things that occur inside hexagons of arbitrary size.

## Usage

A file named `viz-xy-*.yml` must be present in working folder. Each yml file matching that pattern will produce a separate XY Hexagon diagram.

**viz-xy-example.yml**

```yaml
title: "XY Example-1: DRT Vehicles"
file: drt-vehicles.json.gz
thumbnail: thumbnail-vehicles.jpg
center: [6.9814, 51.57]
description: "Total origins/destinations by area"
data:
  elements: drtRequests
  aggregations:
    - title: Origins
      x: 0
      y: 1
    - title: Destinations
      x: 3
      y: 4
```

## YAML fields explained

**file:** a json or gzip'ed json file containing an array with the data (CSV support coming soon)

**data:** You can specify multiple aggregations in the data section.

- `elements` is the name of the property containing the data array
- `aggregations` is a list of `title`, `x`, `y` which say which COLUMNS of data in the elements array contain the x,y data.
- _Note column numbers are zero-based!_

## XY Data File format

Right now only JSON files are supported. The file must have an object with a property whose name is the element. Here's an example that matches the sample YML above.

In this example, each array element is also an array with xy data in columns 0,1 and 3,4. The row elements can also be regular JSON objects, in which case the x/y columns can be referenced by name instead number.

```json
{
    "drtRequests": [
        [ 6.2343, 52.123, 0, 6.33, 52.23, 0],
        [ 7.0341, 51.237, 0, 7.81, 51.44, 0],
        ...
    ]
}
```

All other elements in the JSON are ignored.

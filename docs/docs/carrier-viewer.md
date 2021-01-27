---
id: carrier-viewer
title: Carrier Viewer
---

![carriers-banner](assets/carriers.jpg)
_MATSim carrier plans_

## Usage

TBA

A file named `viz-carrier*.yaml` must be present in working folder. Each yml file matching that pattern will produce a separate DRT visualization.

**viz-carrier-example.yml**

```yaml
---
title: "Dynamic Response Shared Taxis"
description: Inaktive Sammeltaxis (Quadräte); Aktive Sammeltaxis (gelb)
drtTrips: drt-vehicles.json.gz
thumbnail: thumbnail-vehicles.jpg
center: [13.391, 52.515]
```

## YAML fields explained

**drtTrips:** the output from the ~/scripts/parse-drt-events.py script, gzipped for best performance

**center:** Use this to force the map center point. `[long,lat]`

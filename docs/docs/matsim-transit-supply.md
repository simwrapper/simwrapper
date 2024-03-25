---
id: transit-supply
title: MATSim Transit supply/demand
---

![transit banner](assets/transit.jpg)
_Transit routes_

This viz shows transit route details.

## Usage

No YAML is required. If the run folder contains a `*output_transitSchedule.xml.gz` file, then this view will be available and the transit route supply can be explored.

**Stop-to-stop ridership:** If the run folder also contains `*pt_stop2stop_departures.csv.gz` then the transit ridership (demand) will also be loaded. This may take a few seconds.

## Dashboard

The following configuration options are available when embedding the transit viewer in a dashboard.  Use `type: transit` for this plugin.
```yaml
layout:
  row1:
    - type: transit
      title: Transit Explorer
      network: "*output_network.xml.gz"
      transitSchedule: "*output_transitSchedule.xml.gz"
      projection: EPSG:25832 # Use your EPSG coordinate system here
```

### Exploring transit

Click on any transit link to see the list of transit routes which traverse that link. You can select any individual route from the details panel to see the extent of the route.

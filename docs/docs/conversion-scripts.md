---
id: scripts
title: Conversion Scripts
---

_For getting MATSim outputs into aftersim_

In general, most MATSim outputs are too big and use unwieldy formats. The scripts below can help convert some MATSim outputs into smaller, more internet-friendly formats.

If you develop your own scripts, please let us know and we can add them here!

---

## create-csv-network.py

- Download script here: **[create-csv-network.py](https://raw.githubusercontent.com/aftersim/aftersim.github.io/source/scripts/create-csv-network.py)**

_Create a CSV network appropriate for loading into R with the `sfnetworks` package_

**Command:**

`python3 create-csv-network.py [my-network.xml.gz]`

**Inputs:** MATSim network.xml.gz file

**Outputs:** network.csv file with one row per link. Includes a `wkt` column with the WKT LINESTRING field, from which an R sfnetwork can be created.

Sample code to read the output CSV into R:

```R
library(tidyverse)
library(sfnetworks)
library(sf)

sf <- st_as_sf(read_csv("my-network.csv"), wkt="wkt", crs=25832)
network <- as_sfnetwork(sf)

ggplot() +
  geom_sf(data=st_as_sf(filtered, "edges"), col="grey50") +
  geom_sf(data=st_as_sf(filtered, "nodes"), aes(size=1)
```

---

## create-json-network.py

Create a JSON network appropriate for loading into aftersim visualizations

- Download script here: **[create-json-network.py](https://raw.githubusercontent.com/aftersim/aftersim.github.io/source/scripts/create-json-network.py)**

**Command:**

`python create-json-network.py [network] [coord-system]`

**Inputs:** MATSim network.xml.gz file; coordinate system

**Outputs:** `network.json.gz` which loads into aftersim much faster than an `.xml.gz` file

---

## parse-drt-link-events.py

Parse the event file containing DRT events.

- Download script here: **[parse-drt-link-events.py](https://raw.githubusercontent.com/aftersim/aftersim.github.io/source/scripts/parse-drt-link-events.py)**

**Command:** `python3 parse-drt-link-events.py [network] [events] [coord-system]`

**Inputs:** network.xml.gz file; events.xml.gz file; a valid coordinate system

The command will run much faster if you filter the events file to only contain drt events first. You can use `grep` or a similar tool, with a command like:

- `zcat events.xml.gz | grep "drt" > drt-events.xml`
- But that strips the xml header and footer so actually doesn't work. You need the `<events>` and `</events>` tags. I'll fix this soon..?

**Outputs:** `drt-vehicles.json`

Use gzip to compress that output so things load faster.

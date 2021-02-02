---
id: scripts
title: Conversion Scripts
---

_Conversion scripts for MATSim outputs_

---

## create-network-csv.py

- Download script here: **[create-network-csv.py](https://raw.githubusercontent.com/aftersim/aftersim.github.io/source/scripts/create-network-csv.py)**

**Command:** `python3 create-network-csv.py [my-network.xml.gz]`

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

## parse-drt-link-events.py

Parse the event file containing DRT events.

- Download script here: **[parse-drt-link-events.py](https://raw.githubusercontent.com/aftersim/aftersim.github.io/source/scripts/parse-drt-link-events.py)**

**Command:** `python3 parse-drt-link-events.py [network] [events] [coord-system]`

**Inputs:** network.xml.gz file; events.xml.gz file; a valid coordinate system

**Outputs:** `drt-vehicles.json`

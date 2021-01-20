---
id: link-vols
title: Link Volumes
---

Link bandwidth plot plugin. Supports regular bandwidth plots as well as difference and sum plots when comparing two alternatives.

## Usage

A file named `viz-links-*.yml` must be present in working folder. Each yml file matching that pattern will produce a separate link volume diagram.

**viz-links-example.yml**

```yaml
---
title: "Passagieraufkommen in Sammeltaxis"
description: "Stündliches Passagieraufkommen in Sammeltaxis"
csvFile: "../base/hourlyTrafficVolume_passengers_VEHICLEFILTER-drt-vehicles.csv"
csvFile2: "Vu-DRT-1.link_hourlyTrafficVolume_passengers_VEHICLEFILTER-drt-vehicles.csv"
geojsonFile: ../vulkaneifel-network.geo.json.gz
shpFile: "vulkaneifel-network/vulkaneifel-network.shp"
dbfFile: "vulkaneifel-network/vulkaneifel-network.dbf"
projection: "EPSG:25832"
widthFactor: 0.01
sampleRate: 0.25
thumbnail: thumbnail-roads.jpg
shpFileIdProperty: "ID"
```

## YAML fields explained

---

**geojsonFile:** geojson-converted network file. Use the python script in `scripts/create-network.py` to create a geojson network from a matsim network.xml.gz file.

- Command is `python3 create-network.py [mynetwork.xml.gz]`
- and will create a file with the name `mynetwork.json.gz`.

**shpFile,dbfFile:** (deprecated) filenames for the alternative, slower network file in shapefile format. Don't use this if you have created the geojson network file above.

**csvFile**: dataset, or "base" dataset for difference plots

**csvFile2:** (optional) "project" dataset for difference plots

**sampleRate:** MATSim simulation sample rate; i.e. a 1% sample should use `0.01` here so that volumes are scaled properly

**shpFileIdProperty:** property name of field in Shapefile which contains area ID for linking shapefile regions to csvFile data.

---

Note: All filename fields can refer to parent folders using `../`.

- example: `geojsonfile: '../networks/base.json.gz'`

This works as far up the hierarchy as the base of the public-svn specified in `svnConfig.js` but no further.

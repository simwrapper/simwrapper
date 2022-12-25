---
id: guide-getting-started
title: 1. Getting started tutorial
---

Welcome to SimWrapper! Let's get you up and running with the basics. This guide uses sample data that's hopefully a lot like the data you will be using.

## Outline of Getting Started Guide

### 1. Get and start up SimWrapper in your data folder

(create a sample-data.zip with some useful data)

- Install with `pip install simwrapper` or `conda install -c conda-forge simwrapper`
- Switch to your data folder and run `simwrapper here`

### 2. Area maps and CSV data

- Get some sample data such as `git clone https://github.com/simwrapper/simwrapper-example-project`
- Load a shapefile or geojson
- Add a datafile
- set some colors, filters
- Save your map in a YAML file

### 3. Create a dashboard with some charts

- Introduce `dashboard-*.yaml` templates with a few line or area charts
- Layout with columns, rows
- Multiple tabs with multiple dashboard.yaml files
- You can always see the raw files on the Files tab of each dashboard

### 4. Add maps to the dashboard

- Dashboards can include any of the vizualization types listed in the reference docs!
- Let's add our map from above using a `type: map` dashboard panel

### 5. Configuring dashboard templates for multiple run folders

- In SimWrapper, everything is folder-based. So `viz-*.yaml` and `dashboard-*.yaml` files in a folder will automatically be detected and loaded based on their filenames. If you want to define dashboards that will be used for multiple folders, such as several runs for a particular project,

- **Create a folder** named `simwrapper` in the parent project directory.
- Move all dashboard, viz, and template YAMLs into that folder
- Tweak any file paths as necessary, so that relative file names resolve properly.
- The base folder for a dashboard is the _folder you are viewing_, not the dashboard template folder.
- You can have multiple `simwrapper` folders all the way up your folder hierarchy; dashboard panels will be generated based on filename, and each found dashboard will be displayed as a tab on the folder view.


---
_old text_

## 2. Visualizations and their YAML files

Most MATSim outputs such as the `*.xml.gz` files are too large to open in a web browser, so there is also a set of _visualization plugins_ which can display something useful for you. Plugins exist for lots of things and the list is growing: link volumes, agent animations, aggregate area summaries, and more.

Here's how it works: For every visualization you want to create, you write a small _configuration file_ and store it in the same folder as the inputs for that visualization. (We use the YAML text format, which is a common configuration file format.) For each properly named YAML file, one visualization thumbnail will appear in that folder when you navigate to the folder in SimWrapper. Clicking on the thumbnail will open that visualization full-screen.

Generally, a viz will require a specific set of inputs, and those inputs are usually the result of some _post-processing_ of the raw MATSim outputs. It's up to you to do that post-processing and commit the files to public-svn in the same folder as your config file.

## 3. Creating visualizations for your model outputs

Here is an example YAML config file for a link-volume summary:

**viz-links-example.yaml:**

```yaml
title: 'Taxi Passengers'
description: 'Hourly passenger pickups'
csvFile: 'vol_passengers.csv'
geojsonFile: '../road-network.json.gz'
projection: 'EPSG:25832'
sampleRate: 0.10
```

This config names two files, a CSV of link volumes and a zipped JSON file of the MATSim road network, and some parameters needed for the viz to work. Those files are outputs of some post-processing scripts described in the plugin docs.

If you wanted to look at several different link volume plots from the same model run, (e.g. for vehicle counts instead of passengers), you would make a copy of this file, give it a different name, and edit the `csvFile` parameter to point to the correct CSV.

This is a very different paradigm than most "point and click" GIS tools, but we have found that the ability to script and cut/paste the config files has been a huge time saver and also reduces manual errors.

> Make sure that your files are allowed to be "world-readable" before you publish anything to public-svn! Once files are pushed to public-svn, they are not secured in any way; anyone on the internet can access them!

### Visualization types

Each visualization is described in the API Reference section of this documentation, including how to post-process your outputs if necessary, and how to define any configuration settings for your visualizations.


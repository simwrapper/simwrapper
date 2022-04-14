---
id: getting-started
title: 1. Getting started tutorial
---

Welcome to SimWrapper! Let's get you up and running with the basics. This guide uses sample data that's hopefully a lot like data you have or use.

## Outline of Getting Started Guide

### 1. Get and start up SimWrapper in your data folder

(create a sample-data.zip with some useful data)

- Install with `pip install simwrapper` or `conda install simwrapper`
- Switch to your data folder and run `simwrapper here`

### 2. Area maps and CSV data

- Get some sample data
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

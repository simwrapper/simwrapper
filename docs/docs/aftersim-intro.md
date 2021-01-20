---
id: aftersim-intro
title: Introduction
slug: "/"
---

**aftersim** is a unique, web-based data visualization portal developed for use by researchers involved with disaggregate, agent-based transportation simulations such as [MATSim](https://matsim.org). It enables many interactive views such as agent movements through time, aggregate link and area volumes, scenario comparison, and a lot more.

The open-source code and plugin architecture of aftersim allows you to fork the project and create your own visualizations, too.

This repo contains documentation for the interactive visualization platform **aftersim**, available at [aftersim.github.io](https://avoev-vsp.github.io).

This guide assumes you are either using the [main aftersim site](https://aftersim.github.io), or have already set up your own instance of aftersim and have access to the file storage area that you configured.

## 1. How aftersim works

aftersim is essentially a very fancy file browser that works on the web. It reveals the file storage area that is the "root" of your files subfolders. For VSP, our public subversion server is that file storage.

### File and folder browsing

You can browse through any folders and files that have been stored on public-svn, and you can create your own project folders there for your simulations, too.

For each folder, aftersim shows zoomable thumbnails of the any image files in that folder, including all of the standard MATSim summary charts with iteration statistics, mode shares, etc.

### Visualizations and their YAML files

Most MATSim outputs such as the `*.xml.gz` files are too large to open in a web browser, so there is also a set of _visualization plugins_ which can display something useful for you. Plugins exist for lots of things the the list is growing: link volumes, agent animations, aggregate area summaries, and more.

Here's how it works: For every visualization you want to create, you write a small _configuration file_ and store it in the same folder as the inputs for that visualization. (We use the YAML text format, which is a common configuration file format.) For each properly named YAML file, one visualization thumbnail will appear in that folder when you navigate to the folder in aftersim. Clicking on the thumbnail will open that visualization full-screen.

Generally, a viz will require a specific set of inputs, and those inputs are usually the result of some _pre-processing_ of the raw MATSim outputs. It's up to you to do that pre-processing and commit the files to public-svn in the same folder as your config file.

## 2. Creating visualizations for your model outputs

Here is an example YAML config file for a link-volume summary:

**viz-links-example.yaml:**

```yaml
title: "Taxi Passengers"
description: "Hourly passenger pickups"
csvFile: "vol_passengers.csv"
geojsonFile: "../road-network.json.gz"
projection: "EPSG:25832"
sampleRate: 0.10
```

This config names two files, a CSV of link volumes and a zipped JSON file of the MATSim road network, and some parameters needed for the viz to work. Those files are outputs of some pre-processing scripts described in the plugin docs.

If you wanted to look at several different link volume plots from the same model run, (e.g. for vehicle counts instead of passengers), you would make a copy of this file, give it a different name, and edit the `csvFile` parameter to point to the correct CSV.

This is a very different paradigm than most "point and click" GIS tools, but we have found that the ability to script and cut/paste the config files has been a huge time saver and also reduces manual errors.

:::warning
Make sure that your files are allowed to be "world-readable" before you publish anything to public-svn! Once files are pushed to public-svn, they are not secured in any way; anyone on the internet can access them!
:::

### Plugins

Each visualization is described in the "Plugins" section of this documentation, including how to pre-process the outputs and how to define any configuration settings.

If you want to modify or create your own plugins, check out the [to be written](/)

---

## Thank you!

I'm glad you're here! Good luck with aftersim and thank you for the feedback and contributions. -- [Billy](https://github.com/billyc)

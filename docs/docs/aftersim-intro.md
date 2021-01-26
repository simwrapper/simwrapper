---
id: aftersim-intro
title: Introduction
slug: "/"
---

![aftersim banner](../static/img/banner.png)

aftersim is a unique, web-based data visualization tool for researchers building disaggregate, agent-based transportation simulations with [MATSim](https://matsim.org).

---

aftersim provides many interactive views such as agent movements through time, aggregate link and area volumes, scenario comparison, and a lot more.

The open-source code and plugin architecture of aftersim allows you to fork the project and create your own visualizations, too.

This guide assumes you are either using the [main aftersim site](https://aftersim.github.io), or have already set up your own instance of aftersim and have access to the file storage area that you configured.

## 1. How aftersim works

aftersim is essentially a very fancy file browser that works on the web. It reveals the file storage area that is the "root" of your files subfolders. For VSP, our public subversion server is that file storage. You can also view files on your local computer by running a tiny file server locally.

For each folder, aftersim shows zoomable thumbnails of the any image files in that folder, including all of the standard MATSim summary charts with iteration statistics, mode shares, etc. It will also show thumbnails for any visualizations that you have set up for that folder (See #2 below).

### Viewing local folders on your computer

You can use aftersim to browse files on your local computer if you run a small file server app on "localhost:8000". You can set any folder on your computer as the root folder, and then aftersim will be able to access anything in that folder and subfolders below it. Only you will have access to these files: they are not network- or internet-accessible.

We have local file servers written in Java and Python. Pick whichever one you are more comfortable with:

**Python:** - this should work with Python 2.7 or 3.x:

1. Download [serve.py](https://raw.githubusercontent.com/aftersim/aftersim.github.io/source/scripts/serve.py) and save somewhere useful, like your home directory.
2. `cd` to the root folder you wish to serve, and then run the command
3. `/path/to/serve.py` or `~/serve.py` if it's in your home directory
4. Test that it's working by browsing to <http://localhost:8000>. If you see a file listing, then it is working! 🎉 🎉

**Java:**

Run the .jar file directly:

1. Download [mini-file-server.jar](https://github.com/aftersim/mini-file-server/raw/master/bin/mini-file-server.jar) and run with the command
2. `java -jar mini-file-server.jar [rootfolder]`
3. If you don't provide a root folder, mini-file-server will use the .jar file's working folder. That may or may not be what you want!
4. On Windows you can double-click the .jar file to run it and serve the folder it is in.
5. Test that it's working by running the server and browsing to <http://localhost:8000>. If you see a file listing, then it is working! 🎉 🎉

On Mac, if you want to double-click the file to run:

1. Download [mini-file-server-mac](https://github.com/aftersim/mini-file-server/raw/master/bin/mini-file-server-mac)
2. Open a terminal and find the file _(probably Downloads folder)_ and issue the command
   - `chmod +x mini-file-server-mac` to make it executable
3. Move it to the folder you want to serve, and you can now double-click to start the server
4. Test that it's working by running the server and browsing to <http://localhost:8000>. If you see a file listing, then it is working! 🎉 🎉

### Viewing files stored on public-svn and other internet locations

The main aftersim site can be used to view all project folders on the VSP public-svn server. If you have write access to public-svn, you can create your own project folders there for your simulations, too.

To set up aftersim for other storage locations, you need to either fork aftersim and set up your own instance, pointing to a storage location somewhere. This is what we did for the AVÖV project, for example. Billy can probably help you get this set up.

## 2. Visualizations and their YAML files

Most MATSim outputs such as the `*.xml.gz` files are too large to open in a web browser, so there is also a set of _visualization plugins_ which can display something useful for you. Plugins exist for lots of things the the list is growing: link volumes, agent animations, aggregate area summaries, and more.

Here's how it works: For every visualization you want to create, you write a small _configuration file_ and store it in the same folder as the inputs for that visualization. (We use the YAML text format, which is a common configuration file format.) For each properly named YAML file, one visualization thumbnail will appear in that folder when you navigate to the folder in aftersim. Clicking on the thumbnail will open that visualization full-screen.

Generally, a viz will require a specific set of inputs, and those inputs are usually the result of some _post-processing_ of the raw MATSim outputs. It's up to you to do that post-processing and commit the files to public-svn in the same folder as your config file.

## 3. Creating visualizations for your model outputs

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

This config names two files, a CSV of link volumes and a zipped JSON file of the MATSim road network, and some parameters needed for the viz to work. Those files are outputs of some post-processing scripts described in the plugin docs.

If you wanted to look at several different link volume plots from the same model run, (e.g. for vehicle counts instead of passengers), you would make a copy of this file, give it a different name, and edit the `csvFile` parameter to point to the correct CSV.

This is a very different paradigm than most "point and click" GIS tools, but we have found that the ability to script and cut/paste the config files has been a huge time saver and also reduces manual errors.

:::warning
Make sure that your files are allowed to be "world-readable" before you publish anything to public-svn! Once files are pushed to public-svn, they are not secured in any way; anyone on the internet can access them!
:::

### Plugins

Each visualization is described in the "Plugins" section of this documentation, including how to post-process the outputs and how to define any configuration settings.

If you want to modify or create your own plugins, check out the [to be written](/)

---

## Thank you!

I'm glad you're here! Good luck with aftersim and thank you for the feedback and contributions. -- [Billy](https://github.com/billyc)

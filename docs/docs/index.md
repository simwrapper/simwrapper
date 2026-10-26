---
id: index
title: SimWrapper
---

![SimWrapper banner](assets/simwrapper-scrnshot-collage.jpg)

**SimWrapper** is a unique, web-based data visualization tool for researchers building disaggregate transportation simulations with software such as [MATSim](https://matsim.org) and [ActivitySim](https://activitysim.github.io).

SimWrapper creates interactive dashboards and provides many statistical views and chart types, just like other viz frameworks. But SimWrapper also knows a lot about transportation, and has good defaults for producing visualizations of network link volumes, agent movements through time, aggregate area maps, scenario comparison, and a lot more.

You don't need to code in any language to use SimWrapper -- you point it at your files, and write some small text (YAML) configuration files to tell SimWrapper what to do. SimWrapper does the rest!

If you know JavaScript, the open-source code and plugin architecture of SimWrapper allows you to fork the project and create your own visualizations, too. But you don't need to know JavaScript if SimWrapper already does what you need.

## How SimWrapper works

SimWrapper is a web platform that can display either individual full-page data visualizations, or collections of visualizations in "dashboard" format. It expects your simulation outputs to just be regular files on your filesystem somewhere; there is no centralized database or cloud server that you need to upload your results to.

To tell SimWrapper where your data files are:

- You can view files on your local computer directly in Google Chrome and Edge, or by running a tiny file server locally for Safari and Firefox (Chrome is recommended)
- At VSP TU-Berlin, we have connected SimWrapper to our public file server, and use that for producing publicly accessible data dashboards
- You can set up your own local SimWrapper server on your LAN or use internet file storage
- If you have access to a remote compute cluster, you can see those files too if you mount the remote file system on your machine.

Once you point SimWrapper to your collection of files, some visualizations will be immediately available — depending on what SimWrapper finds in your folder.

For other visualization s, you'll create tiny configuration files (in YAML format) which tell SimWrapper what to load, how to lay out the dashboards, and which provide all the config details to get it started. These files can be collected in project folders and then will apply to all runs in a set of folders, if you want.

## Getting Started with SimWrapper

### 1. SimWrapper online demo

Go to <https://vsp.berlin/simwrapper> and explore the project dashboards on the home page there. You'll get an idea of what's possible with SimWrapper.

### 2. Copying the demo files and exploring them locally

We've created a SimWrapper example project with sample datasets and configurations ready to go.
- Download and unzip the latest [simwrapper-example-project.zip](https://github.com/simwrapper/simwrapper-example-project/archive/refs/heads/main.zip) from the GitHub [example project](https://github.com/simwrapper/simwrapper-example-project)
- Open Google Chrome (for this demo, it's easiest to use Chrome because it has an API for accessing local files on your computer; Firefox and Safari don't)
- Click **Add Local folder...** and navigate to the unzipped folder you just created. You'll see lots of example visualizations and dashboards!
- You can open any of datasets or the `.yaml` configuration files in the archive to see how the files and parameters are specified. Change things and see what happens.

### 3. Going further

The guides to the left cover the basics of getting up and running, building your first visualizations and dashboards, and publishing results online.

There is also an API Reference page for each type of visualization, where you can find all of the configuration details for each type.

Finally, our [GitHub Issue Tracker](https://github.com/simwrapper/simwrapper/issues) is the best place to ask questions and seek help.


## Thank you!

It has been a lot of fun creating SimWrapper. This research was developed at the Technische Universität Berlin Department of Transport Telematics and Transport System Planning, under the direction of Professor Kai Nagel.

Additional funding has been provided by the San Francisco County Transportation Authority in San Francisco, California, and by member agencies of the ActivitySim Consortium.

I'm glad you're here! Good luck with SimWrapper and thank you for the feedback and contributions. -- [Billy](https://billyc.github.io/)

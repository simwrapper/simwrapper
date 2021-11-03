---
id: simwrapper-installation
title: Installation & Setup
---

This page details **build instructions** for setting up your own instance of a SimWrapper website.

- If you are only interested in _using SimWrapper,_ -- whether the [official TU Berlin SimWrapper](https://vsp.berlin/simwrapper) or your own team's version of it -- then _you do not need to read this page._
- Read [this introduction](simwrapper-intro.md) instead, or go straight to the [dashboard guide](dashboards.md).

## Foundational technologies

You will need to know this tech in order to hack on this website. If you already know Python, learning TypeScript/Javascript is not that huge of a leap, but it will definitely take some time to learn the full stack.

- [TypeScript](https://typescriptlang.org) - typesafe Javascript. And if you don't know Javascript, you probably want to learn that first
- [Vue](https://vuejs.org) - the glue that connects UI elements to code. Similar to React but lightweight and awesome
- [Pug](https://pugjs.org/) - the template language used in our Vue files, far easier than writing bare HTML. You really only need Pug [tags](https://pugjs.org/language/tags.html) and [attributes](https://pugjs.org/language/attributes.html)
- [Deck.gl](https://deck.gl) - WebGL library for the fancy animations.

## Setting up your development environment

All tooling and source code is entirely free! You can build and hack on SimWrapper without purchasing anything. The site uses [Node.js](https://nodejs.org) for build & dependency management, and was developed using [VS Code](https://code.visualstudio.com/).

1. Install [the latest "LTS" Version of Node.js](https://nodejs.org/en/)
2. Install [VS Code](https://code.visualstudio.com/)
3. The following VS Code plugins are required. Find them in the VS Code plugin directory.
   - **Prettier** to force code-style consistencey
   - **Vetur**, the official Vue plugin.

## First time setup

You need to fork or clone the Github source repository, and then use the `npm` node package manager to install all of the javascript dependency libraries.

The main SimWrapper source repo is at <https://github.com/simwrapper/simwrapper> but _you may want to clone a different repo_ if you are working on a different project such as [ActivitySim](https://github.com/ActivitySim/dashboard) or the [SFCTA model](https://github.com/sfcta/simwrapper)

1. Clone the repo:

- `git clone https://github.com/simwrapper/simwrapper # or your fork`
- `cd simwrapper`

2. Install node dependencies

- `npm ci`
- This will spew lots of warnings but should ultimately finish without hard errors

Congrats! You now have SimWrapper installed and you are ready to start hacking! 🎉✨

## Development Commands

**Build and run a local copy of the site** This command runs a local server with hot reload for testing, which usually listens on http://localhost:8080

This is the main command you will use to start up the dev server, hack on your changes in VS Code, and see the results.

- `npm run serve`

**Compile and minifies for production** This command builds for production, which performs some optimizations and catches some build-time errors. You probably want to run this before you push anything live.

- `npm run build`

**Run unit tests** Well... I have not written tests but the infrastructure is there to use `jest`.

- `npm run test:unit`

**Pushing to the live site** If you have write access to your repository, you can push a build to it automatically go live on Github Pages. DO NOT DO THIS unless you are on the core team ;-)

- First, edit the file `package.json` and modify the `deploy` line to match your repository name. _Don't push to simwrapper/simwrapper unless you mean it!_
- Then you can run `npm run deploy` to build and push the final site.

## Project Layout

- `/scripts`: Housekeeping scripts go here. Most of these are used for postprocessing model results, written in Python, and also some build scripts are found here.
- `/src`: all TypeScript and Vue files go here
  - `/src/assets`: images, .CSVs, etc that get packaged by the build process go here
  - `/src/charts`: Dashboard chart types go here. Each chart type is a separate Vue component.
  - `/src/components`: shared Vue components go here, there are lots of them
  - `/src/js`: some typscript utility classes
  - `/src/layers`: shared deck.gl layer files go here. These are generally written in JSX.
  - `/src/plugins`: Each visualization plugin type gets its own folder here. To create your own plugin, copy one of these, rename its folder and main .vue file, and register it in `pluginRegistry.ts`. Read the plugin developer guide for details.
  - `/src/views`: The Vue pages that render various site pages such as the home page. Vue pages are registered in `/src/router.ts`
- `/public`: These files are pushed as-is by the build process; they are not packaged in any way. They end up in the root folder '/' of the built site.

### Thanks for your interest!

Good luck and thanks for the help! -- [Billy](https://github.com/billyc)

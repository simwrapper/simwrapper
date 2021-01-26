---
id: aftersim-installation
title: Installation & Setup
---

This page details build instructions for setting up your own instance of an aftersim website.

- If you are only interested in using aftersim at aftersim.github.io (in other words, if you are at VSP Berlin and want to view model results), then **you do not need to read this page.** (Read [these instructions](aftersim-intro.md) instead or go to the [plugin guide](aggregate-od.md))

## Project pre-requisites

The site uses npm and yarn, and was developed using VS Code.

- You should install VS Code, npm, and yarn first.
- All code is TypeScript and shall remain so.

The following VS Code plugins are used:

- Prettier to force code style consistencey
- Vetur, for Vuejs support. This site is a [Vue](https://vuejs.org) SPA.
- Shader languages support

## Foundational technologies

You will need to know this tech in order to hack on this website:

- [TypeScript](https://typescriptlang.org) - typesafe JavaScript
- [Vue](https://vuejs.org) - the glue that connects UI elements to code. Similar to React but lightweight and awesome
- [ThreeJS](https://threejs.org) - WebGL library for the fancy animations.
- [Pug](https://pugjs.org) - the template language used in Vue files. Pug uses Python-style indentation instead of open/close XML tags, which makes it far easier to read than bare HTML.

## First time install

One line fetches everything from the npm database:

```
npm ci
```

## Development Commands

### Compiling and hot-reloads during development

This command runs a local server with hot reload for testing, usually listens on http://localhost:8080

```
npm run serve
```

### Compiles and minifies for production

```
npm run build
```

### Run your unit tests

Well... I have not written tests but the infrastructure is there to use `jest`.

```
npm run test:unit
```

### Pushing to the live site

Travis-CI is configured to automatically build the site with **every push to master**, so don't push to master until you are ready for your code to go live.

- Travis config is in `.travis.yml`

## Project Layout

- `/src`: all TypeScript and Vue files go here
- `/src/assets`: images, .csvs, etc that get packaged by webpack
- `/src/components`: shared Vue components go here
- `/src/HomeIndex.vue`: the front page. Add new thumbnails for pages or other content here.
- `/src/plugins`: Each visualization plugin has its own folder under the `/src/plugins` folder.
  - Connect up your new vizes by adding a new folder here, and also adding the component to `pluginRegistry.ts`.
- `/scripts`: Python scripts go here, which are often used for postprocessing results
- `/public`: Files here are pushed as-is by webpack; i.e. they are not packaged in any way

### Thanks for your interest!

Good luck and thanks for the help! -- [Billy](https://github.com/billyc)

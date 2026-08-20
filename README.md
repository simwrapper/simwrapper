# SimWrapper data visualization platform

This repo contains the source code for the interactive data visualization tool **SimWrapper**

This README details build instructions for the platform, intended for developers.

- SimWrapper is available for use by anyone at https://simwrapper.app
- DOCUMENTATION available at: https://docs.simwrapper.app/docs
- VSP/TU-Berlin also has a departmental SimWrapper site at <https://vsp.berlin/simwrapper>
- There is also a companion Python project which embeds this platform, so that end-users can install and run SimWrapper locally with a single command: `uv tool install simwrapper`.  See https://pypi.org/simwrapper for details!

## Project prerequisites

The site uses Node and pnpm, and was mostly developed using VS Code. Install NodeJS, pnpm, and VS Code first:

1) NodeJS is the JavaScript engine available at https://nodejs.org. Use an LTS v22 or above.
2) pnpm is a node "package manager" which manages project library dependencies, and is faster and more space-efficient than raw npm. Install from https://pnpm.io
3) You don't have to use VS Code but it is free and feature-rich: https://code.visualstudio.com
 
The following VS Code plugins are used:

- **Vue (Official)** to support .vue files natively. SimWrapper is a Vue single page application
- **Prettier** to force code style consistencey
- **ESLint** for code quality hints
- **Shader language** support if you will be developing your own custom 3D views using Deck.gl

## Foundational technologies - what you need to know

We recently finished a huge effort to retire a LOT of technical debt, and are now using Vue 3.x, TypeScript 6, Vite 8 build system, Deck.gl 9.x, the pnpm package manager, and more. Many many new UI tests were added to ensure the migration would disrupt as little as possible, but PRs are welcome for any regressions that you notice!

You will need to know this tech in order to hack on this project:

- [TypeScript](https://typescriptlang.org) - typesafe JavaScript
- [Vue](https://vuejs.org) - the glue that connects UI elements to code. Similar to React but lightweight and awesome
  - We have finished migrating to Vue 3.x!! Woohoo. The code uses the Vue 3 **Option API**, not the Composition API. So if you are learning Vue from the [Vue tutorial](https://vuejs.org/guide/introduction.html), be sure to set the slider to `Options` so the examples look the same!
- [Pug](https://pugjs.org) - the template language used in Vue files. Pug uses Python-style indentation instead of open/close XML tags, which makes it far easier to read than bare HTML. You don't have to write your own Pug templates; you can use plain HTML, but almost all of our `.vue` files use Pug so you will need to know how to read it. 
  - We have a [PUG.md](PUG.md) doc which should explain enough so you can read and understand Pug
    templates.

## First time developer setup

One line fetches everything from the npm database:

```
pnpm i
```

## Development Commands

### Compiling and hot-reloads during development

```
pnpm dev
```
This runs a local server with hot reload for testing, usually listens on http://localhost:5173

### Compiles and minifies for production

```
pnpm build
```
This builds the entire site into the `dist` folder, ready for uploading to any static web server

### Run tests

```
pnpm test
```
This runs all of the Playwright UI tests. There are hundreds of tests now and it may take many minutes on your machine.
- Playwright will by default run using **4 CPUs**. Depending on your machine this may cause some timeouts on some longer-running tests. You can choose the number of CPUs by running `pnpm test -j 2` for example. Experiment to find the highest number that always works =)

### Pull requests and automated testing

Thanks for contributing! When creating PRs, set the target branch to the `staging` branch , not `master`. We merge all PRs there, and build a staging version of the site before pushing final versions. (Maybe we'll change this someday to be more normal)

GitHub Actions is configured to automatically run the tests and try to build the site with **every PR request**, so please run the testing suite locally BEFORE you create the PR! This will save us all a lot of time :-)

## Project Layout

- `/src`: all TypeScript and Vue files go here
- `/src/fileSystemConfig.ts`: this file defines the file storage locations available on the front page. See the docs for the various types of filesystems that SimWrapper supports!
- `/src/assets`: images, .csvs, etc that get packaged by webpack
- `/src/components`: shared Vue components go here
- `/src/layers`: shared deck.gl layer files go here
- `/src/plugins`: Each viz plugin gets its own folder here. To create your own plugin, copy one of these, rename its folder and main .vue file, and register it in `pluginRegistry.ts`. Read the plugin developer guide for details.
- `/src/js`: typescript utility classes, notably including the DashboardDataManager and HTTPFileServer
- `/src/layout`: The Vue pages that render various site pages such as the home page. Vue pages are registered in `/src/router.ts`
  - `SplashPage.vue` The front page.
  - `FolderBrowser.vue`: File system pages that don't contain dashboards will be rendered using this template, displaying folders, images, etc. like a file browser.
- `/public`: large .zip files, project notes, etc go in public. These files are pushed as-is by the build system; i.e. they are not packaged in any way
- `/scripts`: Random external scripts go here. Most of these are in Python and used for postprocessing model results

## Thank you!

Good luck and thanks for the help! -- [Billy](https://github.com/billyc)

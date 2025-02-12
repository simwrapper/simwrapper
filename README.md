# SimWrapper project website

This repo contains the interactive visualization website for **SimWrapper**, available at https://simwrapper.github.io

- VSP TU Berlin also has a departmental SimWrapper site at <https://vsp.berlin/simwrapper>
- DOCS available at: https://simwrapper.github.io/docs

This README details build instructions for the website itself.


## Project prerequisites

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
npm run dev
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
- `/src/svnConfig.ts`: this file defines the file storage locations available on the front page. The `svn` parameter must be a valid URL pointing to an http fileserver, running either Apache, subversion, or SimpleFileServer. Other file storage could be written and placed in `/src/util`.
- `/src/assets`: images, .csvs, etc that get packaged by webpack
- `/src/components`: shared Vue components go here
- `/src/layers`: shared deck.gl layer files go here
- `/src/plugins`: Each plugin gets its own folder here. To create your own plugin, copy one of these, rename its folder and main .vue file, and register it in `pluginRegistry.ts`. Read the plugin developer guide for details.
- `/src/util`: some typscript utility classes, notably including the HTTPFileServer
- `/src/views`: The Vue pages that render various site pages such as the home page. Vue pages are registered in `/src/router.ts`
  - `HomeIndex.vue`: the front page. Add new thumbnails for pages or other content here.
  - `FolderBrowser.vue`: Project pages are rendered by this page
- `/public`: large .zip files, project notes, etc go in public. These files are pushed as-is by webpack; i.e. they are not packaged in any way
- `/scripts`: Python scripts go here. Most of these are used for postprocessing model results

## Thank you!

Good luck and thanks for the help! -- [Billy](https://github.com/billyc)

## Version 2!

Lots of recent changes including some config file breaking-changes, so it's time to bump the major version number!

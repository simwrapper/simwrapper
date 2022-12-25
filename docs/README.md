# SimWrapper Documentation website

This website is built using [Docusaurus 2](https://v2.docusaurus.io/), a modern static website generator.

If you are looking for SimWrapper itself, see <https://simwrapper.github.io>

## Installation

```console
cd website
yarn install
```

## Local Development

```console
cd website
yarn start
```

This command starts a local development server and open up a browser window. Most changes are reflected live without having to restart the server.

## Build

```console
cd website
yarn build
```

This command generates static content into the `build` directory and can be served using any static contents hosting service.

## Deployment

The main docs repo at <https://github.com/simwrapper/simwrapper.github.io> uses GitHub Actions to auto-build the site after every commit on the `master` branch.

If you are using GitHub pages for hosting, this command is a convenient way to build the website and push to the `gh-pages` branch.

```console
GIT_USER=<Your GitHub username> USE_SSH=true yarn deploy
```

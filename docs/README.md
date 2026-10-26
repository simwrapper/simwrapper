# SimWrapper Documentation website

This folder holds the SimWrapper documentation site at <https://docs.simwrapper.app>,
built with [Docusaurus v1](https://v1.docusaurus.io/).

- `docs/` — the documentation pages (Markdown)
- `website/` — the Docusaurus site: config, sidebars, blog posts, custom pages and static assets
- `graphics/` — screenshots and artwork

`PUG.md` and `SVN-README.md` in this folder are developer notes for the app, not part of the website.

## Building

The site is a standalone pnpm project, separate from the app's workspace. Run these from the repo root:

```console
pnpm docs:install   # first time only
pnpm docs:start     # local dev server with live reload
pnpm docs:build     # static site in docs/website/build/simwrapper.app
```

`docs/docs/CHANGELOG.md` is generated from `docs/docs/CHANGELOG-header.md` and the root `CHANGELOG.md`
on every start/build, so don't edit it directly.

## Deployment

The `docs-deploy` GitHub Actions workflow builds the site on every push to `main` that touches `docs/`
or `CHANGELOG.md`. It publishes the result to the `gh-pages` branch of
[simwrapper/simwrapper.github.io](https://github.com/simwrapper/simwrapper.github.io), which serves
`docs.simwrapper.app`.

#!/usr/bin/env bash
# DEPLOY: Build site into /dist folder and PUSH to gh-pages branch ON GITHUB
# This script expects TWO arguments:
# $1 - Github user/repo (e.g. "matsim-vsp/simwrapper")
# $2 - BASE_URL folder (e.g. for https://vsp.berlin/simwrapper -> "simwrapper")

set -euo pipefail

echo --- CLEARING ---
rm -rf dist

echo --- Set up Github Pages SPA links ---
# always start with clean config
git checkout vite.config.ts public/404.html
# $1 is github repo; $2 is base URL folder (without slashes)
sed -i "s#'/'#'/$2/'#"  vite.config.ts
sed -i "s#'/'#'/$2/'#"  public/404.html

echo --- BUILD INDEX.HTML FILES ---
npm run index

echo --- BUILD SITE ---
node --max_old_space_size=8192 ./node_modules/vite/bin/vite.js build

echo --- CREATE GIT COMMIT FOR GH-PAGES ---
cd dist
git init .
git add . && git commit -m "gh-pages"

echo --- PUSH TO GITHUB ---
git remote add origin git@github.com:$1.git
git config --global user.email "you@example.com"'
git config --global user.name "GitHub Actions"'
git push --force origin master:gh-pages


#!/usr/bin/env bash
# DEPLOY: Build site into /dist folder and PUSH to gh-pages branch ON GITHUB
# This script expects TWO arguments:
# $1 - Github user/repo (e.g. "matsim-vsp/simwrapper")
#
# Note this now uses Vite "module" support and thus vite.config.ts -> vite.config.mts

set -euo pipefail

echo --- CLEARING ---
rm -rf dist

echo --- Set up Github Pages SPA links ---
# always start with clean config
git checkout vite.config.mts public/404.html

echo --- GET LATEST COMMIT ID ---
SIMWRAPPER_COMMIT=`git rev-parse --short HEAD`
SIMWRAPPER_TAG=`git describe --tags --abbrev=0`
sed -I .bak "s/local_build/$SIMWRAPPER_COMMIT/"  .env
sed -I .bak "s/no_tag/$SIMWRAPPER_TAG/"  .env

echo --- BUILD INDEX.HTML FILES ---
npm run index

echo --- BUILD SITE ---
echo "simwrapper.app" > public/CNAME
node --max_old_space_size=8192 ./node_modules/vite/bin/vite.js build

echo --- CREATE GIT COMMIT FOR GH-PAGES ---
cd dist
git init .
git add . && git commit -m "gh-pages"

echo --- PUSH TO GITHUB ---
git remote add origin git@github.com:$1.git
git push --force origin master:gh-pages

#!/usr/bin/env bash
# DEPLOY: Build site into /dist folder and PUSH to gh-pages branch ON GITHUB
set -euo pipefail

echo --- BUILDING ---
npm run build

echo --- CREATING GIT COMMIT FOR GH-PAGES ---
cd dist
git init .
git add . && git commit -m "gh-pages"

echo --- PUSHING TO GITHUB ---
git remote add origin git@github.com:$1.git
git push --force origin master:gh-pages


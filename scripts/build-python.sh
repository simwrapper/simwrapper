#!/usr/bin/env bash
# BUILD PYTHON PACKAGE: Build the app into /dist, copy it into python/simwrapper/static,
# and build the "simwrapper" wheel + sdist into python/dist.
#
# Run from anywhere; paths are resolved relative to the repo root.

set -euo pipefail

cd "$(dirname "$0")/.."

echo --- CLEARING ---
rm -rf dist python/dist python/simwrapper/static

echo --- GET LATEST COMMIT ID ---
# env vars take precedence over .env, so the tracked .env file stays untouched
export VITE_COMMIT=`git rev-parse --short HEAD`
export VITE_TAG=`git describe --tags --abbrev=0 --match 'v*'`

echo --- BUILD SITE ---
pnpm install --frozen-lockfile
NODE_OPTIONS=--max_old_space_size=8192 pnpm build

echo --- COPY SITE INTO PYTHON PACKAGE ---
cp -r dist python/simwrapper/static
# a CNAME left in public/ by the GitHub Pages deploy scripts has no meaning here
rm -f python/simwrapper/static/CNAME

echo --- BUILD PYTHON PACKAGE ---
cd python
uv build
ls -l dist

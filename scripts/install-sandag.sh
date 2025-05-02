#!/usr/bin/env bash
# --------------------------------------------
# SANDAG bash script for installing SimWrapper
# --------------------------------------------
# Prerequisites:
# - Blob storage is mounted using rclone
# - NodeJS 20.x+ installed
# - uv python environment tool installed
# --------------------------------------------

# fail immediately on all errors
set euo pipefail

# build JavaScript code using node (tested on nodejs 20.x, 22.x)
npm ci
npm build

# set up python environment using uv
cd azure-api
uv sync

# patch pytables to work properly with rclone mounted blob filesystem
patch .venv/lib/python3.12/site-packages/tables/utils.py pytables.patch

# copy javascript into static folder
cp -R ../dist/* static/

# that's it! we are ready to run:
# debug mode:
# - uv run OmxServer.py
# Linux:
# - uv run gunicorn  --config gunicorn_config.py OmxServer:app
# Windows:
# - uv run waitress-serve --listen=*:4999 OmxServer:app

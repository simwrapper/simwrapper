#!/usr/bin/env bash
# BUILD-INDEX: build index.html files iteravily for public/data folder
set -euo pipefail

node scripts/build-index.js public/data

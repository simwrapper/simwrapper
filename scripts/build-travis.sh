#!/usr/bin/env bash
# -----------------------------------------------------
# build-travis.sh:
# copy files to the right places and then use yarn to build the site
# Requires $SVN_USER and $SVN_PASSWORD env variables to be set
# -----------------------------------------------------
# set strict mode: fail smart, don't hide pipe errors
set -euo pipefail
IFS=$'\n\t'
# -----------------------------------------------------

yarn run build && yarn run test:unit

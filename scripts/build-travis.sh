#!/usr/bin/env bash
# -----------------------------------------------------
# set strict mode: fail smart, don't hide pipe errors
set -euo pipefail
IFS=$'\n\t'
# -----------------------------------------------------

npm run build && npm run test:unit

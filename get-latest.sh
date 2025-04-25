#!/bin/bash
# ---------------
# Example script for updating to latest SimWrapper code
# set: fail on all errors
set euo pipefail

git checkout build
git pull

sudo systemctl restart gunicorn


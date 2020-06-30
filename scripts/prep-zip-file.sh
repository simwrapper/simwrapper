#!/usr/bin/env bash

# Bash script to unzip, filter, and re-zip battery results

# set strict mode: fail smart, don't hide pipe errors
set -euo pipefail
IFS=$'\n\t'

# Make sure city name was passed
if (( $# != 1 )); then
    echo "Must pass city name EXACTLY as written in infections.txt"
    echo "e.g.:  prep-zip.file.sh Berlin"
    exit 1
fi

unzip summaries.zip

# filter
for each in `ls summaries/*infections.txt`; do
    echo $each
    head -1 $each > $each.csv
    cat $each | grep $1 >> $each.csv
done

zip --junk-paths summaries-filtered.zip summaries/*csv

mv summaries/metadata.yaml .
mv summaries/_info.txt .


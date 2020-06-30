# v7-crunch-berlin-numbers.py
# ---------------------------
# The latest *.infections.txt have one row per neighborhood instead of
# one row per day. Also there is an extra row for 'unknown' district,
# which needs to be clipped out.
#
# Use v7-crunch-berlin.sh bash script to run for each infections file.
#
# Usage: python crunch.py sz*.txt
# Outputs: one sz*.csv per input file
import sys
import pandas as pd
from dfply import *

for infile in sys.argv[1:]:
    out_filename = infile[: infile.find("txt")] + "csv"

    try:
        info = pd.read_csv(infile, sep="\t")

        group = info >> filter_by(X.district == "München") >> drop(X.time)

        summary = group.pivot_table(index="day", aggfunc="sum", margins=False)

        # annoying - python doesn' retain csv column order
        ordered = summary[
            [
                "nSusceptible",
                "nInfectedButNotContagious",
                "nContagious",
                "nShowingSymptoms",
                "nSeriouslySick",
                "nCritical",
                "nTotalInfected",
                "nInfectedCumulative",
                "nRecovered",
                "nInQuarantine",
            ]
        ]

        ordered.to_csv(out_filename)
    except:
        print(" ----> ERROR parsing", infile)

# File descriptions: What are berlin-cases.csv, berlin-hospital.csv, etc etc?

## cityname-cases.csv

These files are NO LONGER USED but are saved here because older model versions use them. The actual, reported cases of COVID-19 come from RKI.

- Up to model **version v6**, these results were manually processed and stored in the
  /src/assets folder as berlin-cases.csv, heinsberg-cases.csv, and munich-cases.csv.

- From model **version v7 and onward**, the UI pulls the reported cases from
  subversion at [this link](https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries/de/episim/original-data/Fallzahlen/RKI)

In all model versions, the reported cases are created from the RKI data using a
python script in that same subversion folder linked above.

## cityname-hospital.csv

The hospitalization data for Berlin and Munich is in /src/assets/[city]-hospital.csv

These numbers come from different sources, also stored in public-svn in the Fallzahlen
folder linked above.


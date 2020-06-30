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

RKI_FILE=https://www.arcgis.com/sharing/rest/content/items/f10774f1c63e40168479a1feb6c7ca74/data

wget -nv -O rki.csv $RKI_FILE

# create the [city]-cases.csv files
python3 scripts/rki-update.py rki.csv
yarn run build && yarn run test:unit
exit 0

# put them in the right places
svn checkout --username $SVN_USER --password $SVN_PASSWORD --no-auth-cache --depth infinity \
    https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries/de/episim/original-data/Fallzahlen/

cp *cases* src/assets
cp *cases* Fallzahlen/RKI

TIMESTAMP=`date`
svn commit --username $SVN_USER --password $SVN_PASSWORD  --no-auth-cache -m "autobuild: $TIMESTAMP" Fallzahlen

# Get Berlin hospital data too
cp Fallzahlen/Berlin/berlin-hospital.csv src/assets

# --- process DIVI cases for Berlin.
# 1. fetch existing csv's from SVN:
svn checkout --username $SVN_USER --password $SVN_PASSWORD --no-auth-cache --depth infinity \
    https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries/de/episim/original-data/Fallzahlen/DIVI/

# 2. scrape most recent csv from website:
cd DIVI/Daily_reports
export SRC="https://www.divi.de/divi-intensivregister-tagesreport-archiv"

wget -qO - ${SRC} \
  | grep "\.csv\"" \
  | head -1 \
  | awk -v src=$SRC -F "\"" '// {print $4, src $2}' \
  | xargs wget -qO

BERLIN_CODE="11000"
printf "csv,gemeindeschluessel,anzahl_meldebereiche,faelle_covid_aktuell,faelle_covid_aktuell_beatmet,anzahl_standorte,betten_frei,betten_belegt,daten_stand\n" > ../berlin-divi-processed.csv
grep $BERLIN_CODE *.csv  |  sort  >>  ../berlin-divi-processed.csv

MUNICH_CODE="9162"
printf "csv,gemeindeschluessel,anzahl_meldebereiche,faelle_covid_aktuell,faelle_covid_aktuell_beatmet,anzahl_standorte,betten_frei,betten_belegt,daten_stand\n" > ../munich-divi-processed.csv
grep $MUNICH_CODE *.csv  |  sort  >>  ../munich-divi-processed.csv

svn st | sed -rn '/^\?/s/^.{8}(.+)$/\1/p' | xargs -r svn add

cd ../..

svn st | sed -rn '/^\?/s/^.{8}(.+)$/\1/p' | xargs -r svn add
svn st | sed -rn '/^!/s/^.{8}(.+)$/\1/p' | xargs -r svn rm

svn commit --username $SVN_USER --password $SVN_PASSWORD  --no-auth-cache -m "DIVI autobuild: $TIMESTAMP" DIVI

# DONE WITH PREP! Build the site.
yarn run build && yarn run test:unit


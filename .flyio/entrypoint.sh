#!/bin/bash
# Runner script for executing Playwright tests on fly.io instead of GitHub Actions.
# Tests are taking waaaay too long with just 2 GitHub CPUs.
set -euo pipefail
exec 2>&1

# make sure working folder is on the /data volume
mkdir -p /data/work
rm -rf /home/runner/actions-runner/_work
ln -s /data/work /home/runner/actions-runner/_work
chown runner:runner /data/work
chmod 777 /data/work


set +e
echo "=== launching run.sh as user runner"
su runner -c "cd /home/runner/actions-runner && stdbuf -oL -eL ./run.sh --jitconfig '${JIT_CONFIG}'"
RUN_EXIT=$?
set -e

echo "=== run.sh exited with code $RUN_EXIT"

if [ $RUN_EXIT -ne 0 ]; then
  echo "run.sh failed with exit code $RUN_EXIT — sleeping 10m for debugging"
  sleep 600
  exit $RUN_EXIT
fi

# job finished — kill this fly.io machine
flyctl machine destroy "${FLY_MACHINE_ID}" --force -a "${FLY_APP_NAME}"

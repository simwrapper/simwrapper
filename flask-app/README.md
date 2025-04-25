# Azure for (SANDAG) SimWrapper running in Azure container with blob access

Current build notes as of 2025-03-25:

- Requires NodeJS 20.x

```bash
# cd to repo root
# cd ~/git/simwrapper -- need to be in base/root folder of repo
cd ..
# install Node dependencies
npm ci
# Build javascript project
npm run build
# Copy build site into azure static assets folder
cp -R dist/* azure-api/static
# Build docker image
# ...
# Send to Azure container
# ...
```

const config: any = {
  projects: [
    {
      name: 'Public Szenarios DE',
      url: 'public-svn',
      description: 'Test svn access (public-svn)',
      svn: 'https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries/de/',
      need_password: false,
    },
    {
      name: 'Localhost:8000',
      url: 'local',
      description:
        "Verwenden Sie 'scripts/serve.py', um auf lokale Dateien ohne Server zuzugreifen.",
      svn: 'http://localhost:8000',
      need_password: true,
    },
    {
      name: ' Berlin SNZ (Broken)',
      url: 'snz-berlin',
      description: 'Berlin Szenario (runs-svn)',
      svn: 'https://svn.vsp.tu-berlin.de/repos/runs-svn/avoev/snz-berlin/',
      need_password: true,
    },
  ],
}

export default config

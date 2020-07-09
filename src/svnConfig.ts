const config: any = {
  projects: [
    {
      name: 'Public Scenarios DE',
      url: 'public-svn',
      description: 'Test svn access (public-svn)',
      svn: 'https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries/de/',
      need_password: false,
    },
    {
      name: 'Demo Localhost',
      url: 'local',
      description:
        "Verwenden Sie 'scripts/serve.py', um auf lokale Dateien ohne Server zuzugreifen.",
      svn: 'http://localhost/',
      need_password: true,
    },
    {
      name: 'TU Cluster',
      url: 'cluster',
      description: 'TU Mathe Cluster',
      svn: 'http://localhost:8000/cluster/',
      need_password: false,
    },
  ],
}

export default config

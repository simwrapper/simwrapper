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
      name: 'Localhost',
      url: 'local',
      description:
        "Verwenden Sie 'scripts/serve.py', um auf lokale Dateien ohne Server zuzugreifen.",
      svn: 'http://localhost:8000',
      need_password: true,
    },
  ],
}

export default config

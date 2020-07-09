const config: any = {
  projects: [
    {
      name: 'AVÖV',
      url: 'avoev',
      description: 'AVÖV Project Files',
      svn: 'https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries/de/',
      need_password: false,
    },
    {
      name: 'Public SVN',
      url: 'public-svn',
      description: 'Test svn access (public-svn)',
      svn: 'https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries/de/',
      need_password: false,
    },
    // {
    //   name: 'TU Cluster',
    //   url: 'cluster',
    //   description: 'TU Mathe Cluster',
    //   svn: 'http://localhost/cluster/',
    //   need_password: true,
    // },
    {
      name: 'Localhost (Auth)',
      url: 'local',
      description:
        "Verwenden Sie 'scripts/serve.py', um auf lokale Dateien ohne Server zuzugreifen.",
      svn: 'http://localhost/',
      need_password: true,
    },
    {
      name: 'Serve.py',
      url: 'serve',
      description: 'Local files served by python script serve.py',
      svn: 'http://localhost:8000/',
      need_password: false,
    },
  ],
}

export default config

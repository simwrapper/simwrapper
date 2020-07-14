const config: any = {
  projects: [
    {
      name: 'Public SVN Examples',
      url: 'public-svn',
      description: 'Public MATSim scenarios at VSP',
      svn:
        'https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries/de/viz-examples/',
      need_password: false,
    },
    {
      name: 'AVÖV',
      url: 'avoev',
      description: 'AVÖV Project Files (runs-svn)',
      svn: 'https://svn.vsp.tu-berlin.de/repos/runs-svn/avoev/',
      need_password: true,
    },
    {
      name: 'Shared SVN: Projects',
      url: 'shared-svn',
      description: 'Test shared-svn access with username/pw',
      svn: 'https://svn.vsp.tu-berlin.de/repos/shared-svn/projects/',
      need_password: true,
    },
    {
      name: 'Serve.py',
      url: 'serve',
      description: 'Local files served by python script serve.py',
      svn: 'http://localhost:8000/',
      need_password: false,
    },
    // {
    //   name: 'Localhost (Auth)',
    //   url: 'local',
    //   description:
    //     "Verwenden Sie 'scripts/serve.py', um auf lokale Dateien ohne Server zuzugreifen.",
    //   svn: 'http://localhost/',
    //   need_password: true,
    // },
  ],
}

export default config

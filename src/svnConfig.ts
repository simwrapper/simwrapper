const config: any = {
  projects: [
    {
      name: 'Gallery',
      url: 'gallery',
      description: 'Example visualizations of public datasets.',
      svn:
        'https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries/de/viz-examples/examples',
      need_password: false,
      thumbnail: '/thumb-examples.jpg',
    },
    {
      name: 'Localhost',
      url: 'local',
      description: 'Run mini-file-server to browse files on your PC',
      svn: 'http://localhost:8000',
      need_password: false,
      thumbnail: '/thumb-localfiles.jpg',
    },
    {
      name: 'Public-SVN',
      url: 'public-svn',
      description: 'Simulation results from VSP at TU-Berlin',
      svn: 'https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries',
      need_password: false,
      thumbnail: '/thumb-chart.jpg',
      skipList: ['episim/battery'],
    },
    // {
    //   name: 'ils4 Math Cluster',
    //   url: 'ils4',
    //   description: 'Mount cluster files using sshfs',
    //   svn: 'http://localhost:8000/cluster',
    //   need_password: false,
    //   thumbnail: '/thumb-cluster.png',
    // },
    // {
    //   name: 'Apache (Local)',
    //   url: 'apache',
    //   description: 'Run Apache locally',
    //   svn: 'http://localhost',
    //   need_password: true,
    //   thumbnail: '/thumbnail.png',
    // },
  ],
}

export default config

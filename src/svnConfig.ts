const config: any = {
  projects: [
    {
      name: 'Examples',
      url: 'example',
      description: 'A few visualizations of public datasets.',
      svn:
        'https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries/de/viz-examples/examples',
      need_password: false,
      thumbnail: '/thumb-examples.jpg',
    },
    {
      name: 'zeroCUTS',
      url: 'zerocuts',
      description: 'zeroCUTS Project',
      svn:
        'https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries/de/berlin/projects/zerocuts',
      need_password: false,
      thumbnail: '/thumbnail.png',
    },
    {
      name: 'Public-SVN',
      url: 'public-svn',
      description: 'Simulation results from around the world',
      svn: 'https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries',
      need_password: false,
      thumbnail: '/thumbnail.png',
    },
    {
      name: 'Local Files',
      url: 'local',
      description: 'Run scripts/serve.py to browse files on your PC',
      svn: 'http://localhost:8000/data',
      need_password: false,
      thumbnail: '/thumb-localfiles.png',
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

const config: any = {
  projects: [
    {
      name: 'Public-SVN',
      url: 'public-svn',
      description: 'Simulation results from around the world (by country)',
      svn: 'https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries',
      need_password: false,
      thumbnail: '/thumbnail.png',
    },
    {
      name: 'Gladbeck',
      url: 'gladbeck',
      description: 'AVÖV Projekt: Gladbeck NRW',
      svn:
        'https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries/de/gladbeck/avoev',
      need_password: false,
      thumbnail: '/thumb-gladbeck.jpg',
    },
    {
      name: 'Local Files',
      url: 'local',
      description: 'Use scripts/serve.py to browse local files on your PC',
      svn: 'http://localhost:8000',
      need_password: false,
      thumbnail: '/thumbnail.png',
    },
    {
      name: 'Vulkaneifel',
      url: 'vulkaneifel',
      description: 'AVÖV Projekt: Vulkaneifel RP',
      svn:
        'https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries/de/vulkaneifel/avoev',
      need_password: false,
      thumbnail: '/thumb-vulkaneifel.jpg',
    },
  ],
}

export default config

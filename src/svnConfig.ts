const config: any = {
  projects: [
    {
      name: 'Gladbeck',
      url: 'gladbeck',
      description: 'AVÖV Projekt: Gladbeck NRW',
      svn:
        'https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries/de/gladbeck/avoev/',
      need_password: false,
      thumbnail: '/thumb-gladbeck.jpg',
    },
    {
      name: 'Vulkaneifel',
      url: 'vulkaneifel',
      description: 'AVÖV Projekt: Vulkaneifel RP',
      svn:
        'https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries/de/vulkaneifel/avoev/',
      need_password: false,
      thumbnail: '/thumb-vulkaneifel.jpg',
    },
    // {
    //   name: 'LOCAL FILES',
    //   url: 'local',
    //   description: 'Use serve.py',
    //   svn: 'http://localhost:8000/',
    //   need_password: false,
    //   thumbnail: '/thumb-vulkaneifel.jpg',
    // },
  ],
}

export default config

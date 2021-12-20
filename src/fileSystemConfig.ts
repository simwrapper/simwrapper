import { FileSystemConfig } from '@/Globals'

const fileSystems: FileSystemConfig[] = [
  {
    name: 'Localhost',
    slug: 'local',
    description: 'Run mini-file-server to browse files on your PC',
    baseURL: 'http://localhost:8000',
    thumbnail: '/simwrapper/images/thumb-localfiles.jpg',
  },
  {
    name: 'Public Scenarios',
    slug: 'public',
    description: 'Simulation results from VSP at TU-Berlin',
    baseURL: 'https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries',
    thumbnail: '/simwrapper/images/thumb-chart.jpg',
    skipList: ['episim/battery'],
  },
  {
    name: 'Sample Runs',
    slug: 'sample-runs',
    description: 'Pre-built dashboards for exploration',
    thumbnail: 'images/thumb-localfiles.jpg',
    baseURL: 'https://svn.vsp.tu-berlin.de/repos/public-svn/shared/billy/simwrapper/sample-data',
    hidden: true,
  },
  {
    name: 'KoMoDnext',
    slug: 'komodnext',
    description: 'Automated driving in the digital test field, Düsseldorf',
    description_de: 'Automatisiertes Fahren im digitalen Testfeld Düsseldorf',
    baseURL:
      'https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries/de/duesseldorf/projects/komodnext/website',
    thumbnail: '/simwrapper/images/thumb-localfiles.jpg',
    hidden: true,
  },

  // {
  //   name: 'Gallery',
  //   url: 'gallery',
  //   description: 'Example visualizations of public datasets.',
  //   svn:
  //     'https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries/de/viz-examples/examples',
  //   need_password: false,
  //   thumbnail: '/thumb-examples.jpg',
  // },
  // {
  //   name: 'ils4 Math Cluster',
  //   slug: 'ils4',
  //   description: 'Mount cluster files using sshfs',
  //   baseURL: 'http://localhost:8000/cluster',
  //   needPassword: false,
  //   thumbnail: '/images/thumb-cluster.png',
  // },
  // {
  //   name: 'Apache (Local)',
  //   slug: 'apache',
  //   description: 'Run Apache locally',
  //   baseURL: 'http://localhost',
  //   needPassword: true,
  //   thumbnail: '/images/thumbnail.png',
  // },
]

for (let port = 8000; port < 8500; port++) {
  fileSystems.push({
    name: 'Localhost ' + port,
    slug: `${port}`,
    description: 'Localhost ' + port,
    description_de: 'Localhost ' + port,
    baseURL: 'http://localhost:' + port,
    thumbnail: '/simwrapper/images/thumb-localfiles.jpg',
    hidden: true,
  })
}

export default fileSystems

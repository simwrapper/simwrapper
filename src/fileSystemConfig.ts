import { FileSystemConfig } from '@/Globals'

const fileSystems: FileSystemConfig[] = [
  {
    name: 'Localhost',
    slug: 'local',
    description: 'Run mini-file-server to browse files on your PC',
    baseURL: 'http://localhost:8000',
    needPassword: false,
    thumbnail: '/images/thumb-localfiles.jpg',
    dashboardFolder: '.dashboards',
  },
  {
    name: 'Public-SVN',
    slug: 'public-svn',
    description: 'Simulation results from VSP at TU-Berlin',
    baseURL: 'https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries',
    needPassword: false,
    thumbnail: '/images/thumb-chart.jpg',
    skipList: ['episim/battery'],
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

export default fileSystems

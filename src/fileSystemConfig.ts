import { get, set, clear } from 'idb-keyval'
import { FileSystemConfig, FileSystemAPIHandle } from '@/Globals'
import globalStore from '@/store'

const BASE_URL = import.meta.env.BASE_URL

// The URL contains the websiteLiveHost, calculated at runtime
const loc = window.location
const webLiveHostname = loc.hostname
const websiteLiveHost = `${loc.protocol}//${webLiveHostname}`

export function addLocalFilesystem(handle: FileSystemAPIHandle, key: string | null) {
  const slug = key || 'fs' + (1 + Object.keys(globalStore.state.localFileHandles).length)

  const system: FileSystemConfig = {
    name: handle.name,
    slug: slug,
    description: 'Local folder',
    handle: handle,
    baseURL: '',
  }

  fileSystems.unshift(system)

  // commit to app state
  globalStore.commit('addLocalFileSystem', { key: system.slug, handle: handle })
  // console.log(globalStore.state.localFileHandles)

  // write it out to indexed-db so we have it on next startup
  set('fs', globalStore.state.localFileHandles)
  return system.slug
}

let fileSystems: FileSystemConfig[] = [
  {
    name: webLiveHostname + ' live folders',
    slug: 'live',
    description: 'Files served using "simwrapper here"',
    baseURL: websiteLiveHost + ':3000/_f_', // e.g. 'http://localhost:8050/_f_',
    // hidden: true,
  },
  {
    name: 'PoC Data Folder',
    slug: 'files',
    description: 'Data from /public/data folder',
    baseURL: loc.origin + BASE_URL + 'data/simwrapper',
    // thumbnail: '/simwrapper/images/thumb-localfiles.jpg',
    // hidden: true,
  },

  {
    name: 'Browse data',
    slug: 'view',
    description: "View this site's datasets",
    baseURL: loc.origin + '/data',
    hidden: true,
  },
  {
    name: 'local',
    slug: 'local',
    description: 'Files on this computer, shared using "simwrapper serve" tool',
    baseURL: 'http://localhost:8000',
    thumbnail: '/simwrapper/images/thumb-localfiles.jpg',
  },
  // {
  //   name: 'SimWrapper Examples',
  //   slug: 'examples',
  //   description: 'Pre-built dashboards for exploration',
  //   thumbnail: 'images/thumb-localfiles.jpg',
  //   baseURL: 'https://svn.vsp.tu-berlin.de/repos/public-svn/shared/simwrapper',
  // },
  // {
  //   name: 'VSP Public Scenarios',
  //   slug: 'public',
  //   description: 'Simulation results from VSP at TU-Berlin',
  //   baseURL: 'https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries',
  //   thumbnail: '/simwrapper/images/thumb-chart.jpg',
  //   skipList: ['episim/battery'],
  // },
  // {
  //   name: 'Sample Runs',
  //   slug: 'sample-runs',
  //   description: 'Pre-built dashboards for exploration',
  //   thumbnail: 'images/thumb-localfiles.jpg',
  //   baseURL: 'https://svn.vsp.tu-berlin.de/repos/public-svn/shared/billy/simwrapper/sample-data',
  //   hidden: true,
  // },
  {
    name: 'KoMoDnext',
    slug: 'komodnext',
    description: 'Automated driving in the digital test field, Düsseldorf',
    description_de: 'Automatisiertes Fahren im digitalen Testfeld Düsseldorf',
    baseURL:
      'https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries/de/duesseldorf/projects/komodnext/website',
    thumbnail: '/simwrapper/images/thumb-localfiles.jpg',
    // hidden: true,
  },
  // {
  //   name: 'SFCTA Prospector',
  //   slug: 'champ',
  //   description: 'Shared CHAMP model runs',
  //   baseURL: 'http://prospector/champ_runs',
  //   hidden: true,
  // },
  // {
  //   name: 'RealLabHH',
  //   slug: 'reallabhh',
  //   description: 'digital mobility of tomorrow is being tested in a metropolis here and now',
  //   description_de: 'Digitale Mobilität von morgen im Hier und Jetzt in einer Metropole',
  //   baseURL:
  //     'https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries/de/hamburg/hamburg-v2/hamburg-v2.2/viz',
  //   thumbnail: '/simwrapper/images/thumb-localfiles.jpg',
  // },
]

for (let port = 8000; port < 8049; port++) {
  fileSystems.push({
    name: 'Localhost ' + port,
    slug: `${port}`,
    description: 'Localhost ' + port,
    description_de: 'Localhost ' + port,
    baseURL: 'http://localhost:' + port,
    hidden: true,
  })
}

for (let port = 8050; port < 8099; port++) {
  fileSystems.push({
    name: webLiveHostname + port,
    slug: `${port}`,
    description: webLiveHostname + port,
    description_de: webLiveHostname + port,
    baseURL: websiteLiveHost + `:${port}/_f_`, // e.g. 'http://localhost:8050/_f_',
    hidden: true,
  })
}

// merge user shortcuts
try {
  const storedShortcuts = localStorage.getItem('projectShortcuts')
  if (storedShortcuts) {
    const shortcuts = JSON.parse(storedShortcuts) as any[]
    const unique = fileSystems.filter(root => !(root.slug in shortcuts))
    fileSystems = [...Object.values(shortcuts), ...unique]
  }
} catch (e) {
  console.error('ERROR MERGING URL SHORTCUTS:', '' + e)
}

export default fileSystems

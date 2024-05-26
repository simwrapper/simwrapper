import { get, set, clear } from 'idb-keyval'
import { FileSystemConfig, FileSystemAPIHandle } from '@/Globals'
import globalStore from '@/store'

const BASE_URL = import.meta.env.BASE_URL

// The URL contains the websiteLiveHost, calculated at runtime
const loc = window.location
const webLiveHostname = loc.hostname
const websiteLiveHost = `${loc.protocol}//${webLiveHostname}`

export function addInitialLocalFilesystems(
  filesystems: { handle: FileSystemAPIHandle; key: string | null }[]
) {
  for (let i = 0; i < filesystems.length; i++) {
    const slug = 'fs' + (1 + i)
    const system: FileSystemConfig = {
      name: filesystems[i].handle.name,
      slug: slug,
      description: 'Local folder',
      handle: filesystems[i].handle,
      baseURL: '',
    }
    fileSystems.unshift(system)
    globalStore.commit('addLocalFileSystem', { key: system.slug, handle: system.handle })
  }

  // hang onto count so that we don't overlap as Christian removes and re-adds folders
}

export function addLocalFilesystem(handle: FileSystemAPIHandle, key: string | null) {
  const slug = key || 'fs' + (1 + globalStore.state.numLocalFileSystems)

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

  // write it out to indexed-db so we have it on next startup
  const sorted = [...globalStore.state.localFileHandles]
  sorted.sort((a, b) => (a.handle.name < b.handle.name ? -1 : 1))
  set('fs', sorted)
  return system.slug
}

let fileSystems: FileSystemConfig[] = [
  // DO NOT REMOVE THESE, THEY ARE FOR INTERNAL APP USE
  {
    name: 'interactive',
    slug: '',
    description: 'Drag and Drop"',
    baseURL: '',
    hidden: true,
  },
  {
    name: webLiveHostname + ' live folders',
    slug: 'live',
    description: 'Files served using "simwrapper here"',
    baseURL: websiteLiveHost + ':8050/_f_', // e.g. 'http://localhost:8050/_f_',
    hidden: true,
  },
  {
    name: 'Public Data Folder',
    slug: 'files',
    description: 'Data from /public/data folder',
    baseURL: loc.origin + BASE_URL + 'data',
    hidden: true,
  },

  {
    name: 'Browse data',
    slug: 'view',
    description: "View this site's datasets",
    baseURL: loc.origin + '/data',
    hidden: true,
  },

  // End. Below here, these are editable:

  {
    name: 'VSP Public-SVN',
    slug: 'public',
    description: 'Public data at TU Berlin',
    baseURL: 'https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries',
    thumbnail: '/simwrapper/images/thumb-chart.jpg',
    skipList: ['episim/battery'],
  },
  {
    name: 'Examples',
    slug: 'examples',
    description: 'Pre-built SimWrapper dashboards',
    thumbnail: 'images/thumb-localfiles.jpg',
    baseURL: 'https://svn.vsp.tu-berlin.de/repos/public-svn/shared/simwrapper',
    example: true,
  },
  {
    name: 'Localhost:8000',
    slug: 'local',
    description: 'Files shared using "simwrapper serve"',
    baseURL: 'http://localhost:8000',
    thumbnail: '/simwrapper/images/thumb-localfiles.jpg',
  },
  {
    name: 'Sample Runs',
    slug: 'sample-runs',
    description: 'Pre-built dashboards for exploration',
    thumbnail: 'images/thumb-localfiles.jpg',
    baseURL: 'https://svn.vsp.tu-berlin.de/repos/public-svn/shared/billy/simwrapper/sample-data',
    hidden: true,
    example: true,
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
  {
    name: 'RealLabHH',
    slug: 'reallabhh',
    description: 'Hamburg, Germany',
    description_de: 'Hamburg, Deutschland',
    baseURL:
      'https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries/de/hamburg/hamburg-v2/hamburg-v2.2/viz',
    thumbnail: '/simwrapper/images/thumb-localfiles.jpg',
    example: true,
  },
  {
    name: 'BENE',
    slug: 'bene',
    description: 'Berlin BENE',
    baseURL:
      'https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries/de/berlin/projects/bene/website',
    thumbnail: '/simwrapper/images/thumb-localfiles.jpg',
    hidden: true,
  },
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

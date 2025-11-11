import { get, set, clear } from 'idb-keyval'
import { FileSystemConfig, FileSystemAPIHandle } from '@/Globals'
import globalStore from '@/store'

const BASE_URL = import.meta.env.BASE_URL

// The URL contains the websiteLiveHost, calculated at runtime
let loc = {} as any
let webLiveHostname = 'NOPE'
let websiteLiveHost = 'NOPE'

if (typeof window !== 'undefined') {
  loc = window.location
  webLiveHostname = loc?.hostname
  websiteLiveHost = `${loc?.protocol}//${webLiveHostname}`
}

/** Flask filesystems are running the latest Python flask app which
 * supports OMX file slices and streaming large files!
 */
export function addFlaskFilesystems(flaskEntries: { [id: string]: any }) {
  const roots = Object.keys(flaskEntries).sort().reverse()
  for (const slug of roots) {
    const params = flaskEntries[slug]
    const fsconfig: FileSystemConfig = {
      name: slug,
      slug,
      description: params.description,
      baseURL: window.location.origin, // params.path,
      flask: true,
    }
    fileSystems.unshift(fsconfig)
  }
}

export function addInitialLocalFilesystems(
  filesystems: { handle: FileSystemAPIHandle; key: string }[]
) {
  filesystems.forEach((fsystem, i) => {
    const slug = `${fsystem.key}`
    const fsconfig: FileSystemConfig = {
      name: filesystems[i].handle.name,
      slug: slug,
      description: 'Local folder',
      handle: filesystems[i].handle,
      baseURL: '',
    }
    // place at the front of the list
    fileSystems.unshift(fsconfig)
    globalStore.commit('addLocalFileSystem', { key: fsconfig.slug, handle: fsconfig.handle })
  })
}

export function addLocalFilesystem(handle: FileSystemAPIHandle, key: string | null) {
  let slug = key
  if (!slug) {
    let max = 0
    globalStore.state.localFileHandles.forEach(local => {
      const fs = local.key.split('-')[0]
      const num = parseInt(fs.substring(2))
      max = Math.max(max, num)
    })
    slug = `fs${max + 1}-${handle.name}`
  }

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
    name: 'github',
    slug: 'github',
    description: 'GitHub repo file access',
    baseURL: '',
    isGithub: true,
    hidden: true,
  },
  {
    name: 'interactive',
    slug: '',
    description: 'Drag and Drop"',
    baseURL: '',
    hidden: true,
  },
  {
    name: 'e2e-tests',
    slug: 'e2e-tests',
    description: 'Playwright test data',
    baseURL: 'https://svn.vsp.tu-berlin.de/repos/public-svn/shared/simwrapper-testdata',
    // baseURL: 'http://localhost:8000',
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

  // ----------- End. Below here, these are editable: -------------------

  {
    name: 'VSP/ZIB LakeFS',
    hidden: true,
    slug: 'vsp-zib',
    description: 'Public VSP data at Zuse Institute Berlin',
    baseURL: 'https://download.lake-daki.zib.de/?PATH=vsp&dir=matsim',
    isZIB: true,
    // 'https://download.lake-daki.zib.de/?PATH=vsp&dir=matsim%2Fcountries%2Fde%2Fberlin%2Fberlin-v6.4%2Foutput%2Fberlin-v6.4-10pct',
  },
  {
    name: 'VSP TU-Berlin',
    slug: 'public',
    description: 'Public data at VSP / TU Berlin',
    baseURL: 'https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries',
    thumbnail: '/simwrapper/images/thumb-chart.jpg',
    skipList: ['episim/battery'],
  },
  {
    name: 'Berlin Open Scenario v6',
    slug: 'open-berlin',
    description: 'Standard dashboard from the MATSim SimWrapper contrib',
    thumbnail: 'images/thumb-localfiles.jpg',
    baseURL:
      'https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries/de/berlin/berlin-v6.4/output/berlin-v6.4-10pct/',
    example: true,
  },
  {
    name: 'Hamburg RealLabHH',
    slug: 'reallabhh',
    description: 'Hamburg, Germany',
    description_de: 'Hamburg, Deutschland',
    baseURL:
      'https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries/de/hamburg/hamburg-v2/hamburg-v2.2/viz',
    thumbnail: '/simwrapper/images/thumb-localfiles.jpg',
    example: true,
  },
  {
    name: 'Berlin BENE Project',
    slug: 'bene',
    description: 'widescreen, in German',
    baseURL:
      'https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries/de/berlin/projects/bene/website',
    thumbnail: '/simwrapper/images/thumb-localfiles.jpg',
    hidden: false,
    example: true,
  },
  {
    name: 'Visualization Examples',
    slug: 'examples',
    description: 'Various SimWrapper data vis types',
    thumbnail: 'images/thumb-localfiles.jpg',
    baseURL: 'https://svn.vsp.tu-berlin.de/repos/public-svn/shared/simwrapper',
    example: true,
  },
  {
    name: 'Additional Sample Data',
    slug: 'sample-data',
    description: 'Sample data from various cities',
    thumbnail: 'images/thumb-localfiles.jpg',
    baseURL: 'https://svn.vsp.tu-berlin.de/repos/public-svn/shared/sample-data',
    example: true,
  },
  {
    name: 'Localhost:8000',
    slug: 'local',
    description: 'Files shared using "simwrapper serve" on http://127.0.0.1:8000',
    baseURL: 'http://127.0.0.1:8000',
    thumbnail: '/simwrapper/images/thumb-localfiles.jpg',
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
  if (typeof localStorage !== 'undefined') {
    const storedShortcuts = localStorage.getItem('projectShortcuts')
    if (storedShortcuts) {
      const shortcuts = JSON.parse(storedShortcuts) as any[]
      const unique = fileSystems.filter(root => !(root.slug in shortcuts))
      fileSystems = [...Object.values(shortcuts), ...unique]
    }
  }
} catch (e) {
  console.error('ERROR MERGING URL SHORTCUTS:', '' + e)
}

export default fileSystems

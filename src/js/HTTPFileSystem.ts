import micromatch from 'micromatch'
import { DirectoryEntry, FileSystemConfig, YamlConfigs } from '@/Globals'
import globalStore from '@/store'

const YAML_FOLDER = 'simwrapper'

// Cache directory listings for each slug & directory
const CACHE: { [slug: string]: { [dir: string]: DirectoryEntry } } = {}

// ---------------------------------------------------------------------------

class SVNFileSystem {
  private baseUrl: string
  private urlId: string
  private needsAuth: boolean

  constructor(project: FileSystemConfig) {
    this.urlId = project.slug
    this.needsAuth = !!project.needPassword

    this.baseUrl = project.baseURL
    if (!project.baseURL.endsWith('/')) this.baseUrl += '/'

    if (!CACHE[this.urlId]) CACHE[this.urlId] = {}
  }

  public clearCache() {
    CACHE[this.urlId] = {}
  }

  public cleanURL(scaryPath: string) {
    // hostile user could put anything in the URL really...
    let path = this.baseUrl + scaryPath.replace(/^0-9a-zA-Z_\-\/:+/i, '')
    // console.log('FETCHING:', scaryPath)
    // console.log('CLEAN: ', path)

    path = path.replaceAll('//', '/')
    path = path.replace('https:/', 'https://')
    path = path.replace('http:/', 'http://')
    // console.log('CLEAN2: ', path)
    return path
  }

  private async _getFileResponse(scaryPath: string): Promise<Response> {
    const path = this.cleanURL(scaryPath)

    const headers: any = {}
    const credentials = globalStore.state.credentials[this.urlId]

    if (this.needsAuth) {
      headers['Authorization'] = `Basic ${credentials}`
    }

    const myRequest = new Request(path, { headers })
    const response = await fetch(myRequest).then(response => {
      // Check HTTP Response code: 200 is OK, everything else is a problem
      if (response.status != 200) {
        console.log('Status:', response.status)
        throw response
      }
      return response
    })
    return response
  }

  async getFileText(scaryPath: string): Promise<string> {
    // This can throw lots of errors; we are not going to catch them
    // here so the code further up can deal with errors properly.
    // "Throw early, catch late."
    const response = await this._getFileResponse(scaryPath)
    return response.text()
  }

  async getFileJson(scaryPath: string): Promise<any> {
    // This can throw lots of errors; we are not going to catch them
    // here so the code further up can deal with errors properly.
    // "Throw early, catch late."
    const response = await this._getFileResponse(scaryPath)
    return response.json()
  }

  async getFileBlob(scaryPath: string): Promise<Blob> {
    // This can throw lots of errors; we are not going to catch them
    // here so the code further up can deal with errors properly.
    // "Throw early, catch late."
    const response = await this._getFileResponse(scaryPath)
    return response.blob()
  }

  async getDirectory(scaryPath: string): Promise<DirectoryEntry> {
    // This can throw lots of errors; we are not going to catch them
    // here so the code further up can deal with errors properly.
    // "Throw early, catch late."
    let stillScaryPath = scaryPath.replaceAll('//', '/')

    // don't download any files!
    if (!stillScaryPath.endsWith('/')) stillScaryPath += '/'

    // Use cached version if we have it
    const cachedEntry = CACHE[this.urlId][stillScaryPath]
    if (cachedEntry) {
      return cachedEntry
    }
    // Generate and cache the listing
    const response = await this._getFileResponse(stillScaryPath).then()
    const htmlListing = await response.text()
    const dirEntry = this.buildListFromHtml(htmlListing)
    CACHE[this.urlId][stillScaryPath] = dirEntry

    return dirEntry
  }

  async findAllYamlConfigs(folder: string): Promise<YamlConfigs> {
    const yamls: YamlConfigs = { dashboards: {}, topsheets: {}, vizes: {} }

    const configFolders = []

    // first find all simwrapper folders
    let currentPath = '/'
    const { dirs } = await this.getDirectory(currentPath)
    if (dirs.indexOf(YAML_FOLDER) > -1)
      configFolders.push(`${currentPath}/${YAML_FOLDER}`.replaceAll('//', '/'))

    const pathChunks = folder.split('/')
    for (const chunk of pathChunks) {
      currentPath = `${currentPath}${chunk}/`
      try {
        const { dirs } = await this.getDirectory(currentPath)
        if (dirs.indexOf(YAML_FOLDER) > -1)
          configFolders.push(`${currentPath}/${YAML_FOLDER}`.replaceAll('//', '/'))
      } catch (e) {
        // doesn't matter, skip if it can't read it
      }
    }

    // also add current working folder as final option, which supercedes all others
    configFolders.push(folder)

    // console.log('configFolders', configFolders)

    // find all dashboards, topsheets, and viz-* yamls in each configuration folder.
    // Overwrite keys as we go; identically-named configs from parent folders get superceded as we go.
    const dashboard = 'dashboard*.y?(a)ml'
    const topsheet = 'topsheet*.y?(a)ml'
    const viz = 'viz*.y?(a)ml'

    for (const configFolder of configFolders) {
      const { files } = await this.getDirectory(configFolder)

      micromatch
        .match(files, dashboard)
        .map(yaml => (yamls.dashboards[yaml] = `${configFolder}/${yaml}`.replaceAll('//', '/')))

      micromatch
        .match(files, topsheet)
        .map(yaml => (yamls.topsheets[yaml] = `${configFolder}/${yaml}`.replaceAll('//', '/')))

      micromatch
        .match(files, viz)
        .map(yaml => (yamls.vizes[yaml] = `${configFolder}/${yaml}`.replaceAll('//', '/')))
    }

    // Sort them all by filename
    yamls.dashboards = Object.fromEntries(
      Object.entries(yamls.dashboards).sort((a, b) => (a[0] > b[0] ? 1 : -1))
    )
    yamls.topsheets = Object.fromEntries(
      Object.entries(yamls.topsheets).sort((a, b) => (a[0] > b[0] ? 1 : -1))
    )
    yamls.vizes = Object.fromEntries(
      Object.entries(yamls.vizes).sort((a, b) => (a[0] > b[0] ? 1 : -1))
    )

    // console.log(yamls)
    return yamls
  }

  private buildListFromHtml(data: string): DirectoryEntry {
    if (data.indexOf('SimpleWebServer') > -1) return this.buildListFromSimpleWebServer(data)
    if (data.indexOf('<ul>') > -1) return this.buildListFromSVN(data)
    if (data.indexOf('<table>') > -1) return this.buildListFromApache24(data)

    return { dirs: [], files: [] }
  }

  private buildListFromSimpleWebServer(data: string): DirectoryEntry {
    const regex = /">(.*?)<\/a/
    const dirs = []
    const files = []

    const lines = data.split('\n')
    for (const line of lines) {
      const href = line.indexOf('<li><a href="')
      if (href < 0) continue
      const entry = line.match(regex)
      if (!entry) continue

      // got one!
      const name = entry[1] // regex returns first match in [1]

      if (name.endsWith('/')) dirs.push(name.substring(0, name.length - 1))
      else files.push(name)
    }
    return { dirs, files }
  }

  private buildListFromSVN(data: string): DirectoryEntry {
    const regex = /"(.*?)"/
    const dirs = []
    const files = []

    const lines = data.split('\n')

    for (const line of lines) {
      const href = line.indexOf('<li><a href="')
      if (href < 0) continue
      const entry = line.match(regex)
      if (!entry) continue

      // got one!
      let name = entry[1] // regex returns first match in [1]

      if (name === '../') continue
      if (name.startsWith('./')) name = name.substring(2)

      if (name.endsWith('/')) dirs.push(name.substring(0, name.length - 1))
      else files.push(name)
    }
    return { dirs, files }
  }

  private buildListFromApache24(data: string): DirectoryEntry {
    const regex = /"(.*?)"/
    const dirs = []
    const files = []

    const lines = data.split('\n')

    for (const line of lines) {
      // skip header
      if (line.indexOf('<th "') > -1) continue
      if (line.indexOf('[PARENTDIR]') > -1) continue

      // match rows listing href links only: should be all folders/files only
      const href = line.indexOf('<td><a href="')
      if (href < 0) continue

      const entry = line.substring(href).match(regex)
      if (!entry) continue

      // got one!
      const name = entry[1] // regex returns first match in [1]

      if (name === '../') continue

      if (name.endsWith('/')) dirs.push(name.substring(0, name.length - 1))
      else files.push(name)
    }
    return { dirs, files }
  }
}

export default SVNFileSystem

import micromatch from 'micromatch'
import { DirectoryEntry, FileSystemAPIHandle, FileSystemConfig, YamlConfigs } from '@/Globals'

const YAML_FOLDER = 'simwrapper'

// Cache directory listings for each slug & directory
const CACHE: { [slug: string]: { [dir: string]: DirectoryEntry } } = {}

// ---------------------------------------------------------------------------

class SVNFileSystem {
  private baseUrl: string
  private urlId: string
  private needsAuth: boolean
  private fsHandle: FileSystemAPIHandle | null

  constructor(project: FileSystemConfig) {
    this.urlId = project.slug
    this.needsAuth = !!project.needPassword
    this.fsHandle = project.handle || null

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

    // sanity: /parent/my/../etc  => /parent/etc
    path = new URL(path).href

    return path
  }

  private async _getFileResponse(scaryPath: string): Promise<Response> {
    if (this.fsHandle) {
      return this._getFileFromChromeFileSystem(scaryPath)
    } else {
      return this._getFileFetchResponse(scaryPath)
    }
  }

  private async _getFileFetchResponse(scaryPath: string): Promise<Response> {
    const path = this.cleanURL(scaryPath)

    const headers: any = {}

    // const credentials = globalStore.state.credentials[this.urlId]
    // if (this.needsAuth) {
    //   headers['Authorization'] = `Basic ${credentials}`
    // }

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

  private async _getFileFromChromeFileSystem(scaryPath: string): Promise<Response> {
    // Chrome File System Access API doesn't handle nested paths, annoying.
    // We need to first fetch the directory to get the file handle, and then
    // get the file contents.

    let path = scaryPath.replace(/^0-9a-zA-Z_\-\/:+/i, '')
    path = path.replaceAll('//', '/')
    path = new URL(`http://local/${path}`).href
    path = path.substring(13)

    const slash = path.lastIndexOf('/')
    const folder = path.substring(0, slash)
    const filename = path.substring(slash + 1)

    const dirContents = await this.getDirectory(folder)
    const fileHandle = dirContents.handles[filename]

    const file = (await fileHandle.getFile()) as any

    file.json = () => {
      return new Promise(async (resolve, reject) => {
        const text = await file.text()
        const json = JSON.parse(text)
        resolve(json)
      })
    }

    file.blob = () => {
      return new Promise(async (resolve, reject) => {
        resolve(file)
      })
    }

    return new Promise((resolve, reject) => {
      resolve(file)
    })
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
    if (cachedEntry) return cachedEntry

    // Generate and cache the listing
    const dirEntry = this.fsHandle
      ? await this.getDirectoryFromHandle(stillScaryPath)
      : await this.getDirectoryFromURL(stillScaryPath)

    CACHE[this.urlId][stillScaryPath] = dirEntry
    return dirEntry
  }

  async getDirectoryFromHandle(stillScaryPath: string) {
    // File System API has no concept of nested paths, which of course
    // is how every filesystem from the past 60 years is actually laid out.
    // Caching each level should lessen the pain of this weird workaround.

    // Bounce thru each level until we reach this one.
    // (Do this top down in order instead of recursive.)

    // I want: /data/project/folder
    // get / and find data
    // get /data and find project
    // get project and find folder
    // get folder --> that's our answer

    const contents: DirectoryEntry = { files: [], dirs: [], handles: {} }
    if (!this.fsHandle) return contents

    let parts = stillScaryPath.split('/').filter(p => !!p) // split and remove blanks

    let currentDir = this.fsHandle as any

    // iterate thru the tree, top-down:
    if (parts.length) {
      for (const subfolder of parts) {
        console.log('searching for:', subfolder)
        let found = false
        for await (let [name, handle] of currentDir) {
          if (name === subfolder) {
            currentDir = handle
            found = true
            break
          }
        }
        if (!found) throw Error('Could not find ' + subfolder)
      }
    }

    // haven't crashed yet? Get the listing details!
    for await (let entry of currentDir.values()) {
      if (contents.handles) contents.handles[entry.name] = entry
      if (entry.kind === 'file') {
        contents.files.push(entry.name)
      } else {
        contents.dirs.push(entry.name)
      }
    }
    return contents
  }

  async getDirectoryFromURL(stillScaryPath: string) {
    const response = await this._getFileResponse(stillScaryPath).then()
    const htmlListing = await response.text()
    const dirEntry = this.buildListFromHtml(htmlListing)
    return dirEntry
  }

  async findAllYamlConfigs(folder: string): Promise<YamlConfigs> {
    const yamls: YamlConfigs = { dashboards: {}, topsheets: {}, vizes: {}, configs: {} }

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
    const config = 'simwrapper-config.y?(a)ml'

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

      micromatch
        .match(files, config)
        .map(yaml => (yamls.configs[yaml] = `${configFolder}/${yaml}`.replaceAll('//', '/')))
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
    yamls.configs = Object.fromEntries(
      Object.entries(yamls.configs).sort((a, b) => (a[0] > b[0] ? 1 : -1))
    )

    return yamls
  }

  private buildListFromHtml(data: string): DirectoryEntry {
    if (data.indexOf('SimpleWebServer') > -1) return this.buildListFromSimpleWebServer(data)
    if (data.indexOf('<ul>') > -1) return this.buildListFromSVN(data)
    if (data.indexOf('<table>') > -1) return this.buildListFromApache24(data)

    return { dirs: [], files: [], handles: {} }
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
    return { dirs, files, handles: {} }
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
    return { dirs, files, handles: {} }
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
    return { dirs, files, handles: {} }
  }
}

export default SVNFileSystem

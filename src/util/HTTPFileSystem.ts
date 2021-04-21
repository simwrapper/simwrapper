import { DirectoryEntry, SVNProject } from '@/Globals'
import globalStore from '@/store'

class SVNFileSystem {
  private baseUrl: string
  private urlId: string
  private needsAuth: boolean

  constructor(project: SVNProject) {
    this.urlId = project.url
    this.needsAuth = project.need_password

    this.baseUrl = project.svn
    if (!project.svn.endsWith('/')) this.baseUrl += '/'
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
    let stillScaryPath = scaryPath

    // don't download any files!
    if (!stillScaryPath.endsWith('/')) stillScaryPath += '/'

    const response = await this._getFileResponse(stillScaryPath).then()
    const htmlListing = await response.text()

    return this.buildListFromHtml(htmlListing)
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
      console.log(line)
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
      const name = entry[1] // regex returns first match in [1]

      if (name === '../') continue

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

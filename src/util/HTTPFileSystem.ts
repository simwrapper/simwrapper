import { DirectoryEntry } from '@/Globals'

class SVNFileSystem {
  private baseUrl: string
  private headers: any

  constructor(baseUrl: string, username: string, password: string) {
    this.baseUrl = baseUrl
    if (!baseUrl.endsWith('/')) this.baseUrl += '/'

    // base64 encode username:password for auth requests
    if (username !== '' && password !== '') {
      this.headers = { Authorization: 'Basic ' + btoa(username + ':' + password) }
    } else {
      this.headers = {}
    }
  }

  async getFileText(scaryPath: string): Promise<String> {
    // hostile user could put anything in the URL really...
    let path = this.baseUrl + scaryPath.replace(/^0-9a-zA-Z_\-\/:+/i, '')

    // console.log('fetching text from file:', scaryPath)

    const myRequest = new Request(path, {
      headers: this.headers,
    })

    return await fetch(myRequest)
      .then(response => {
        if (response.status == 200) return response.text()
        console.log({ Status: response.status })
        return ''
      })
      .catch(error => {
        console.log({ HTTPFileSystemError: error })
        return ''
      })
  }

  async getFileJson(scaryPath: string) {
    // hostile user could put anything in the URL really...
    let path = this.baseUrl + scaryPath.replace(/^0-9a-zA-Z_\-\/:+/i, '')

    // console.log('fetching text from file:', scaryPath)

    const myRequest = new Request(path, {
      headers: this.headers,
    })

    return await fetch(myRequest)
      .then(response => response.json())
      .catch(error => {
        console.log({ HTTPFileSystemError: error })
        return {}
      })
  }

  async getDirectory(scaryPath: string): Promise<DirectoryEntry> {
    // hostile user could put anything in the URL really...
    let path = this.baseUrl + scaryPath.replace(/^0-9a-zA-Z_\-\/:+/i, '')

    // don't download any files!
    if (!path.endsWith('/')) path += '/'

    // ok now we're safe
    // console.log('fetching dir:', scaryPath)

    const myRequest = new Request(path, {
      headers: this.headers,
    })

    return await fetch(myRequest)
      .then(response => response.text())
      .then(data => {
        // console.log('made it! no error!')
        return this.buildListFromHtml(data)
      })
      .catch(error => {
        console.log({ SVNError: error })
        return { dirs: [], files: [] }
      })
  }

  private buildListFromHtml(data: string): DirectoryEntry {
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
}

export default SVNFileSystem

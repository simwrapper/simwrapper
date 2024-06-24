import YAML from 'yaml'

import { Base64 } from 'js-base64'
import { sha256 } from 'js-sha256'

const CLIENT_ID = 'Ov23liMkwaPPPufEiUtA'
const REDIRECT_URI = 'https://simwrapper.github.io/staging/github_callback'

async function load(id: string, options: any) {
  try {
    const params = options || {}

    const gist = await (await fetch(`https://api.github.com/gists/${id}`)).json()
    console.log({ gist })

    // If a file was provided, use that one; otherwise use the first file in the gist
    let data = params.file ? gist.files[params.file] : gist.files[Object.keys(gist.files)[0]]

    if (data.truncated) {
      console.log('truncated, get raw', data.raw_url)
      const resp = await fetch(data.raw_url)
      console.log(resp)
      data = await resp.text()
      console.log({ data })
      var content = YAML.parse(data)
      return content
    } else {
      var content = YAML.parse(data.content)
      return content
    }
  } catch (e) {
    console.error(e)
  } finally {
  }
}

export default { CLIENT_ID, REDIRECT_URI, load }

import YAML from 'yaml'

async function load(id: string, options: any) {
  try {
    const params = options || {}

    const gist = await (await fetch(`https://api.github.com/gists/${id}`)).json()
    console.log({ gist })

    // If a file was provided, use that one; otherwise use the first file in the gist
    const data = params.file ? gist.files[params.file] : gist.files[Object.keys(gist.files)[0]]

    var content = YAML.parse(data.content)
    return content
  } catch (e) {
    console.error(e)
  } finally {
  }
}

export default { load }

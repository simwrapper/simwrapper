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
    const data = params.file ? gist.files[params.file] : gist.files[Object.keys(gist.files)[0]]

    var content = YAML.parse(data.content)
    return content
  } catch (e) {
    console.error(e)
  } finally {
  }
}

/** This generates an acceptable URL and "code verifier" for GitHub OAuthx */
function generate_request_auth() {
  const scope = 'gist' // Adjust the scope as needed

  // Generate a random code verifier and derive a code challenge
  const codeVerifier = generateRandomString(128)
  const codeChallenge = generateCodeChallenge(codeVerifier)

  const uriComponent = encodeURIComponent(REDIRECT_URI)

  const authURL =
    `https://github.com/login/oauth/authorize?client_id=${CLIENT_ID}` +
    `&redirect_uri=${uriComponent}&scope=${scope}&response_type=code` +
    `&code_challenge=${codeChallenge}&code_challenge_method=S256`

  return { codeVerifier, authURL }
}

// PKCE.js
// this is from.... Claude.ai. How do I refer to it now? :-/

function generateCodeChallenge(codeVerifier: string) {
  const encodedCodeVerifier = Base64.encodeURI(codeVerifier)
  const codeChallenge = sha256(encodedCodeVerifier)
  return codeChallenge
}

function generateRandomString(length: number) {
  let text = ''
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length))
  }

  return text
}

export default { CLIENT_ID, REDIRECT_URI, load, generate_request_auth }

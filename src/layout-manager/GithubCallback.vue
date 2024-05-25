<template lang="pug">
.github-callback
  h3 {{ message }}
  br
  a(v-if="gistUrl" :href="gistUrl") {{ gistUrl }}

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { Octokit } from '@octokit/rest'

import GIST from '@/js/gist'

export default defineComponent({
  name: 'GithubCallback',
  components: {},
  props: {},

  data: () => {
    return {
      message: 'GitHub Redirecting...',
      gistUrl: '',
    }
  },

  methods: {
    async writeGist(token: string) {
      const gistFilename = localStorage.getItem('gist-map-filename') || ''
      const gistMapYaml = localStorage.getItem('gist-map-yaml') || ''

      if (gistFilename && gistMapYaml) {
        this.message = 'Writing gist'

        // Create a new Gist under the authenticated user's account

        const octokit = new Octokit()

        const gist = await octokit.gists.create({
          public: true,
          files: {
            gistFilename: {
              content: gistMapYaml,
            },
          },
        })

        console.log('Gist created:', gist.data.html_url)
        this.message = 'Gist created: ' + gist.data.html_url
        this.gistUrl = gist.data.html_url || 'bad :-('
      }
    },
  },

  async mounted() {
    console.log('GITHUB CALLBACK APP')
    const url = new URL(window.location.href)
    const code = url.searchParams.get('code')

    if (code) {
      const codeVerifier = localStorage.getItem('gist-code-verifier') || ''

      const redirectUri = encodeURIComponent(GIST.REDIRECT_URI)

      // Exchange the code for an access token
      this.message = 'Fetching token...'
      await this.$nextTick()

      fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: `client_id=${GIST.CLIENT_ID}&redirect_uri=${redirectUri}&code=${code}&code_verifier=${codeVerifier}&grant_type=authorization_code`,
      })
        .then(response => response.json())
        .then(data => {
          this.message = 'GOT TOKEN!'
          const accessToken = data.access_token
          localStorage.setItem('GITHUB_TOKEN', accessToken)
          // !! You can now use the access token to make authenticated requests to the GitHub API !!
          this.writeGist(accessToken)
        })
        .catch(error => {
          console.error('Error:', error)
          this.message = '' + error
        })
    }
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';
</style>

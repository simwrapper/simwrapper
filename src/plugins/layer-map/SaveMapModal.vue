<template lang="pug">
.save-map-modal.fade-in
  .modal-content
    h1.blue Save Map
      p.close-button(@click="$emit('close')"): i.fas.fa-times

    .save-options.flex-row
      b-button.is-outlined.save-option.flex1(
        :class="$store.state.isDarkMode ? 'is-white' : 'is-link'"
        @click="downloadYaml()"
      )
        i(style="font-size: 20px; margin-bottom: 5px").fas.fa-download
        br
        | Download
        br
        | YAML file

      b-button.is-outlined.is-white.save-option.flex1(
        :class="$store.state.isDarkMode ? 'is-white' : 'is-link'"
        @click="uploadGist()"
      )
        i(style="font-size: 20px; margin-bottom: 5px").fas.fa-cloud-upload-alt
        br
        | Upload as
        br
        | GitHub Gist

    p.status-text(v-html="`<p>${statusText}</p>`") {{ statusText }}

    p.disclaimer SimWrapper is a client-side application with no server backend. Data stays on your machine unless you choose to upload it to a cloud service such as GitHub.
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import { Octokit } from '@octokit/rest'

const BASE_URL = import.meta.env.BASE_URL

export default defineComponent({
  name: 'SaveMapModal',
  components: {},

  props: {
    yaml: { type: String, required: true },
  },

  data() {
    return {
      isStillActive: true,
      statusText: '&nbsp;',
    }
  },

  methods: {
    async downloadYaml() {
      this.statusText = 'Saving...'
      await this.$nextTick()

      var element = document.createElement('a')
      element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(this.yaml))
      element.setAttribute('download', 'viz-layers-map.yaml')
      element.style.display = 'none'

      document.body.appendChild(element)
      element.click()
      document.body.removeChild(element)
      this.$emit('close')
    },

    async uploadGist() {
      this.statusText = 'Contacting GitHub...'
      await this.$nextTick()

      const filename = `viz-layers-${Math.floor(Math.random() * 100)}.yaml`

      const files = {} as any
      files[filename] = { content: this.yaml }

      // First try existing token
      let token = localStorage.getItem('github-oauth-token') || ''

      if (token) {
        try {
          const octokit = new Octokit({ auth: token })

          console.log('CREATING GIST:', filename)
          this.statusText = 'Creating Gist...'
          await this.$nextTick()

          const gist = await octokit.gists.create({
            public: true,
            files,
          })

          console.log('Gist created:', gist.data.html_url)
          console.log('Gist created:', gist.data.id)
          const url = `simwrapper.github.io${BASE_URL}gist/${gist.data.id}`

          this.statusText = `<p>Gist id: <b>${gist.data.id}</b></p>
            <p>Saved on GitHub at <a href="https://gist.github.com/${gist.data.id}">gist.github.com</a></p>
            <p><br/>View on SimWrapper at<br/><a target="_blank" href="https://${url}">${url}</a></p>`

          return gist.data.html_url
          //
        } catch (e) {
          console.error('GIST FAIL', e)
          alert('Failed to save GitHub Gist: ' + e)
        } finally {
          // this.$emit('close')
        }
      }

      this.statusText = 'Requesting authorization...'
      await this.$nextTick()

      // If we fell here, then gist failed. Let's try to reauth:
      const randomID = this.promptUserForGithubAuth() // returns immediately

      // Poll server for auth response
      let tries = 1
      while (tries <= 10) {
        if (!this.isStillActive) break
        await new Promise(resolve => setTimeout(resolve, tries * 2 * 1000))
        console.log(tries)

        const response = await fetch(
          `https://simwrapper-oauth-github.fly.dev/get_auth_token?id=${randomID}`
        )
        const json = await response.json()

        if (json.token) {
          token = json.token
          break
        }
        tries++
      }

      if (!token && this.isStillActive) {
        console.error('token timeout')
        this.$emit('error', 'GitHub Authentication timeout. Try again later.')
        return
      }

      // We got a token! Hang onto it
      localStorage.setItem('github-oauth-token', token)

      // And create the Gist!
      const octokit = new Octokit({ auth: token })

      console.log('CREATING GIST:', filename)
      this.statusText = 'Creating Gist...'

      await this.$nextTick()
      try {
        const gist = await octokit.gists.create({
          public: true,
          files,
        })

        console.log('Gist created:', gist.data.html_url)
        return gist.data.html_url
      } catch (e) {
        console.error('GIST FAILED AFTER GOOD AUTH:', e)
      } finally {
        this.$emit('close')
      }
    },

    promptUserForGithubAuth() {
      localStorage.setItem('github-oauth-token', '')
      const random = Math.floor(1e15 * Math.random())

      window.open(
        `https://simwrapper-oauth-github.fly.dev/auth/github?id=${random}`,
        '_blank',
        'location=yes,height=570,width=520,scrollbars=yes,status=yes'
      )

      return random
    },

    keyListener(event: KeyboardEvent) {
      // ESC
      if (event.keyCode === 27) this.$emit('close')
    },
  },

  async mounted() {
    window.addEventListener('keyup', this.keyListener)
  },

  beforeDestroy() {
    window.removeEventListener('keyup', this.keyListener)
    this.isStillActive = false
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

$textBlue: #196096;

.blue {
  color: var(--link); // $textBlue;
  padding-bottom: 0.5rem;
}

.fade-in {
  opacity: 1;
  animation-name: fadeInOpacity;
  animation-iteration-count: 1;
  animation-timing-function: ease-in;
  animation-duration: 0.3s;
}

@keyframes fadeInOpacity {
  0% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}

.save-map-modal {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  user-select: none;
  z-index: 50;
  display: flex;
  flex-direction: column;
  background-color: #00000088;
  padding: 2.5rem;
}

.modal-content {
  margin: 2rem auto auto auto;
  padding: 1.5rem;
  border-radius: 5px;
  filter: drop-shadow(0 0 20px #000011aa);
  background: var(--bgLayerPanel);
  color: var(--text); // #444;
}

h1 {
  line-height: 1.5rem;
  font-size: 1.6rem;
  font-weight: bold;
  margin-bottom: 1rem;
}

.close-button {
  float: right;
}

.close-button:hover {
  cursor: pointer;
  color: #dd1111;
}

.ddfiles {
  font-size: 1.4rem;
}

.disclaimer {
  margin-top: 1rem;
  text-align: center;
  font-size: 0.9rem;
}

.dl-icon {
  color: $textBlue;
  font-size: 2rem;
  margin: 1rem 0;
}

.spacing {
  word-spacing: 50%;
}

a {
  text-decoration: underline;
}

.drag-target {
  padding: 1rem 0;
}

.zz {
  border: 5px solid #00000000;
}

.section-bottom {
  background-color: #c8ffef;
  padding: 1.5rem;
  filter: $filterShadow;
}

.save-options {
  justify-content: center;
  gap: 2rem;
  padding: 2rem 0;
  // border-top: 1px solid var(--link);
  // border-bottom: 1px solid var(--link);
}

.save-option {
  max-width: 10rem;
  max-height: 10rem;
  text-align: center;
  border: 1px solid #88888888;
  border-radius: 8px;
  padding: 4rem 0rem;
}

.status-text {
  color: var(--textBold);
  text-align: center;
}
</style>

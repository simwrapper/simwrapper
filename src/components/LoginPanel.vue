<template lang="pug">
.sidebar-page
    section.sidebar-layout
      b-sidebar(
        type="is-light"
        :fullheight="fullheight"
        :fullwidth="fullwidth"
        :overlay="overlay"
        :right="right"
        :open.sync="open")

        .all-stuff
          .block
            a(href="/")
              img.vsp-logo(
                src="@/assets/images/logos/vsp-logo-300dpi.png"
                alt="TU Berlin VSP Department")

          b-menu-list(label="Login Required")

          p.my-label {{ whichLogin }}: access to this site requires a login.

          b-menu-list(label="Username")
          b-input(v-model="username" placeholder="VSP username" maxlength=30)

          //- b-menu-list(label="Password")
          //- b-input(type="password"
          //-   v-model="password"
          //-   password-reveal)

          b-button.my-space.is-primary(
            @click="clickedLogin"
            :disabled="!username || !password") Login

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import globalStore from '@/store'

export default defineComponent({
  name: 'LoginPanel',
  data: () => {
    const projects = globalStore.state.svnProjects

    return {
      globalState: globalStore.state,
      projects,
      username: '',
      password: '',
      expandOnHover: true,
      fullheight: true,
      fullwidth: false,
      mobile: 'reduce',
      reduce: false,
      overlay: true,
      right: false,
      theme: 'is-light',
      subfolders: [{ name: 'hello' }],
      open: false,
    }
  },
  watch: {
    'globalState.needLoginForUrl'() {
      this.open = this.globalState.needLoginForUrl !== ''
    },

    open() {
      // clear the last login attempt on panel close
      if (!this.open) globalStore.commit('requestLogin', '')
    },
  },
  computed: {
    whichLogin(): string {
      try {
        const project = this.globalState.svnProjects.filter(
          (p: any) => p.url === this.globalState.needLoginForUrl
        )[0]
        return project.name
      } catch (e) {
        // weird
      }
      return 'this site'
    },
  },
  methods: {
    clickedLogin() {
      // username/pw must never be stored in cookies or local storage.
      // Just in memory.
      globalStore.commit('setCredentials', {
        url: this.globalState.needLoginForUrl,
        username: this.username,
        pw: this.password,
      })

      this.globalState.needLoginForUrl = ''
    },
  },
})
</script>

<style lang="scss" scoped>
@import '@/styles.scss';

.boop {
  padding-top: 1rem;
}

.my-space {
  width: 100%;
  margin-top: 3rem;
}

.my-label {
  font-size: 0.9rem;
  color: #666;
  padding-bottom: 2rem;
}

.sidebar-content {
  height: 100%;
}

.sidebar-page {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  .sidebar-layout {
    display: flex;
    flex-direction: row;
    min-height: 100%;
  }
}
@media screen and (max-width: 1023px) {
  .b-sidebar {
    .sidebar-content {
      &.is-mini-mobile {
        &:not(.is-mini-expand),
        &.is-mini-expand:not(:hover) {
          .menu-list {
            li {
              a {
                span:nth-child(2) {
                  display: none;
                }
              }
              ul {
                padding-left: 0;
                li {
                  a {
                    display: inline-block;
                  }
                }
              }
            }
          }
          .menu-label:not(:last-child) {
            margin-bottom: 0;
          }
        }
      }
    }
  }
}
@media screen and (min-width: 1024px) {
  .b-sidebar {
    .sidebar-content {
      &.is-mini {
        &:not(.is-mini-expand),
        &.is-mini-expand:not(:hover) {
          .menu-list {
            li {
              a {
                span:nth-child(2) {
                  display: none;
                }
              }
              ul {
                padding-left: 0;
                li {
                  a {
                    display: inline-block;
                  }
                }
              }
            }
          }
          .menu-label:not(:last-child) {
            margin-bottom: 0;
          }
        }
      }
    }
  }
}
</style>

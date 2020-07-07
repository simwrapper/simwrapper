<template lang="pug">
  .sidebar-page
    section.sidebar-layout
      b-sidebar(
        position="static"
        :mobile="mobile"
        :expand-on-hover="expandOnHover"
        :reduce="reduce"
        :type="theme"
        open)

        .all-stuff
          .block
            a(href="/")
              img.vsp-logo(
                src="@/assets/images/vsp-logo-left.png"
                alt="TU Berlin VSP Department")

          b-menu.is-custom-mobile

            b-menu-list(label="PROJEKTE")
              b-menu-item(icon="information-outline" label="Info")
              b-menu-item(active expanded icon="settings" label="Administrator")
                b-menu-item(icon="account" label="Users")
                b-menu-item(icon="cash-multiple" label="Payments" disabled)
              b-menu-item(icon="account" label="My Account")
                b-menu-item(icon="account-box" label="Account data")
                b-menu-item(icon="home-account" label="Addresses")

            b-menu-list.boop(label="QUICK LINKS")
              b-menu-item(icon="polymer" label="Something")

            b-menu-list.boop(label="Information")
              b-menu-item(icon="office-building" label="AVÖV Webseite")
              b-menu-item(icon="office-building" label="VSP TU-Berlin")
              b-menu-item(icon="polymer" label="Code")

          //- b-menu.is-custom-mobile
          //-   b-menu-list(label="Menu")
          //-     b-menu-item(icon="information-outline" label="Info")
          //-     b-menu-item(active expanded icon="settings" label="Administrator")
          //-       b-menu-item(icon="account" label="Users")
          //-       b-menu-item(icon="cash-multiple" label="Payments" disabled)
          //-     b-menu-item(icon="account" label="My Account")
          //-       b-menu-item(icon="account-box" label="Account data")
          //-       b-menu-item(icon="home-account" label="Addresses")
          //-   b-menu-list
          //-     b-menu-item(label="Expo" icon="link")
          //-   b-menu-list.boop(label="Actions")
          //-     b-menu-item(icon="logout" label="Logout")

</template>

<script>
import globalStore from '@/store'

export default {
  data() {
    return {
      globalState: globalStore.state,
      expandOnHover: false,
      mobile: 'reduce',
      reduce: false,
      fullheight: true,
      theme: 'is-light',
    }
  },
}
</script>

<style lang="scss" scoped>
// p {
//   font-size: 0.5rem;
// }
</style>

<style lang="scss">
@import '@/styles.scss';

.all-stuff {
  padding: 1rem 1rem;
}

.boop {
  padding-top: 1rem;
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

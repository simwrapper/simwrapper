<template lang="pug">
  nav.navbar.is-danger(role="navigation" aria-label="main navigation")
    .navbar-brand
      router-link.home-link.navbar-item(to="/") Home
        //- img(src="https://bulma.io/images/bulma-logo.png" width="112" height="28")

      a.navbar-burger.burger(
        @click='clickedBurger'
        :class="{'is-active': isBurgerActive}"
        role="button"
        aria-label="menu"
        aria-expanded="false"
        data-target="navbarBasicExample")
        span(aria-hidden="true")
        span(aria-hidden="true")
        span(aria-hidden="true")

    #navbarBasicExample.navbar-menu(
      :class="{'is-active': isBurgerActive}"
      @click='clickedBurger')
      .navbar-start

        router-link.navbar-item(to="/snz-berlin/") Berlin-SNZ
        router-link.navbar-item(to="/local/") Localhost

        .navbar-item.has-dropdown.is-hoverable(:class="{'is-active': isDropdownActive}")
          a.navbar-link  Etc
          .navbar-dropdown
            a.navbar-item(:href="'/v9/masks/berlin'") Jelly Donuts
            a.navbar-item(:href="'/v9/tracing2/berlin'") Pickles
            a.navbar-item(:href="'/v8/masks'") Chicken Wings

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'

@Component({})
export default class VueComponent extends Vue {
  private isBurgerActive = false
  private isDropdownActive = false

  private clickedBurger() {
    this.isBurgerActive = !this.isBurgerActive
  }

  private mounted() {}

  @Watch('$route') private routeChanged(to: any, from: any) {
    this.isBurgerActive = false
    this.isDropdownActive = false
  }
}
</script>

<style scoped lang="scss">
@import '@/styles.scss';

#nav {
  background-color: $tuRed;
}

#nav a.router-link-exact-active {
  font-weight: bold;
}

.home-link {
  margin-left: 2.25rem;
}

@media only screen and (max-width: 640px) {
  .home-link {
    margin-left: 0.25rem;
  }

  .space {
    margin: 0 0.6rem;
  }
}

/*


.navbar-dropdown.navbar-item a {
  color: $matsimBlue;
}

#nav a.router-link-active {
  color: #043b26;
}


#nav a.router-link-exact-active.home {
  color: #ffffff;
}

#nav a.router-link-active {
  color: #ffffff;
}

.space {
  margin: 0 1rem;
}

*/
</style>

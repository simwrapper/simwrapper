<template lang="pug">
  nav.navbar.is-link(role="navigation" aria-label="main navigation")
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

        router-link.navbar-item(to="/2020-06-19/") 2020.06.19
        router-link.navbar-item(to="/2020-06-05/") 2020.06.05

        .navbar-item.has-dropdown.is-hoverable(:class="{'is-active': isDropdownActive}")
          a.navbar-link  Older Versions
          .navbar-dropdown
            a.navbar-item(:href="'/v9/masks/berlin'") v9:Masks
            a.navbar-item(:href="'/v9/tracing2/berlin'") v9:Tracing
            a.navbar-item(:href="'/v8/masks'") v8 Masks
            a.navbar-item(:href="'/v7'") v7
            a.navbar-item(:href="'/norun'") v6
            a.navbar-item(:href="'/v5'") v5
            a.navbar-item(:href="'/v4'") v4
            a.navbar-item(:href="'/norun'") v3
            a.navbar-item(:href="'/v2'") v2
            a.navbar-item(:href="'/v1'") v1

        router-link.navbar-item(to="/v3?day=5") Visualizations

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'

@Component({})
export default class VueComponent extends Vue {
  private isBurgerActive = false
  private isDropdownActive = false

  private clickedBurger() {
    console.log('clicked!')
    this.isBurgerActive = !this.isBurgerActive
  }

  private mounted() {}

  @Watch('$route') private routeChanged(to: any, from: any) {
    console.log(this.$route)
    this.isBurgerActive = false
    this.isDropdownActive = false
  }
}
</script>

<style scoped lang="scss">
@import '@/styles.scss';

#nav {
  background-color: $matsimBlue;
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

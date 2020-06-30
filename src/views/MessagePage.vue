<template lang="pug">
#vue-component
  .content

    .stuff(v-html="mdContent")

    hr

    p Go back to the&nbsp;
      router-link(to="/") main page.

</template>

<script lang="ts">
// ###########################################################################
import MarkdownIt from 'markdown-it'

import { Component, Prop, Vue, Watch } from 'vue-property-decorator'

interface Breadcrumb {
  title: string
  url: string
  isActive?: boolean
}

@Component({
  components: {},
})
export default class VueComponent extends Vue {
  private mdContent = ''
  private mdParser = new MarkdownIt()

  public mounted() {
    const text = require('@/assets/no-such-run.md')
    this.mdContent = text // this.mdParser.render(text)
  }

  private currentCity = -1
}

// ###########################################################################
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.content {
  margin-top: 4rem;
  margin-bottom: 2rem;
  padding: 0 3rem;
}

.viewer {
  padding: 0rem 0rem;
  margin: 0rem 0rem;
  max-width: 70em;
  display: flex;
  flex-direction: column;
}

.city-picker {
  display: flex;
  background-color: $bannerHighlight;
  padding: 0.3rem 3rem 0 3rem;
}

.which-city {
  padding: 0rem 2rem 0.2rem 2rem;
  margin-top: 0.1rem;
  font-size: 1.2rem;
  font-weight: bold;
  text-transform: capitalize;
  color: #bbb;
  cursor: pointer;
}

.which-city.selected {
  color: black;
}

.selected {
  padding-top: 0.1rem;
  background-color: $paleBackground;
}

a.selected {
  color: black;
}

.breadcrumb {
  margin: 1rem 3rem 0rem 3rem;
  font-size: 0.8rem;
}

.badpage {
  padding: 5rem 3rem;
  color: $bannerHighlight;
}

@media only screen and (max-width: 640px) {
  .breadcrumb {
    margin: 1rem 1rem 0rem 1rem;
  }

  .city-picker {
    padding: 0.3rem 1rem 0 1rem;
  }

  .which-city {
    padding: 0.5rem 1rem;
  }
}
</style>

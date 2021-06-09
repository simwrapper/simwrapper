<template lang="pug">
#home
  h2 SQL Example — PostgREST + PostGIS
  h3 Select a Run ID:

  button.button.is-large(v-for="run in runs" :key="run" @click="onClick(run)"
    :class="{'is-link': currentRun===run}"
  ) {{ run }}

  hr
  h6 Rows: {{ rows.length }}

  vue-pivottable-ui(
      :data="rows"
      aggregatorName='Sum'
  )
  //- rendererName='Table Heatmap'
  //- :rows="['Payer Gender']"
  //- :cols="['Party Size']"
  //- :vals="['Total Bill']"

</template>

<script lang="ts">
import { Vue, Component, Prop, Watch } from 'vue-property-decorator'

import { VuePivottable, VuePivottableUi } from 'vue-pivottable'
import 'vue-pivottable/dist/vue-pivottable.css'

import globalStore from '@/store'

@Component({
  components: { VuePivottable, VuePivottableUi },
})
class MyComponent extends Vue {
  private api = 'http://localhost:3000'
  private runs: string[] = []
  private db: any
  private currentRun = ''
  private rows: any[] = []

  private mounted() {
    this.loadRuns()
  }

  private async loadRuns() {
    fetch(`${this.api}/runs`)
      .then(response => response.json())
      .then(json => (this.runs = json.map((row: any) => row.run_id)))
  }

  private onClick(run: string) {
    this.generateDashboard(run)
  }

  private generateDashboard(run: string) {
    this.currentRun = run

    fetch(`${this.api}/output_trips?run_id=eq.${run}`)
      .then(resp => resp.json())
      .then(json => (this.rows = json))
  }
}

export default MyComponent
</script>

<style scoped lang="scss">
@import '@/styles.scss';

#home {
  padding: 3rem 3rem;
}

.gap {
  margin-top: 2rem;
  margin-bottom: 2rem;
}

.content {
  flex: 1;
  padding: 1rem 3rem 5rem 3rem;
  display: flex;
  width: 100%;
}

.main {
  margin: 0 auto;
}

.banner {
  display: flex;
  flex-direction: column;
  padding: 6rem 3rem 1rem 3rem;
  background-color: #181a1b;
  color: #f54f5f;
  background: url(../assets/images/banner.jpg);
  background-repeat: no-repeat;
  background-size: cover;
}

.banner h2 {
  margin-bottom: 0rem;
  font-size: 1.6rem;
  line-height: 1.7rem;
  background-color: #181a1b;
  margin-right: auto;
  padding: 0 0.5rem;
}

.banner h3 {
  font-size: 1.3rem;
  font-weight: normal;
  margin-bottom: 0;
  margin-right: auto;
  line-height: 1.4rem;
  padding: 0.25rem 0.5rem;
  background-color: #181a1b;
  // width: max-content;
}

a {
  font-size: 1.1rem;
  color: #00499c;
}

.readme {
  margin-top: 1rem;
  margin-bottom: 3rem;
  flex: 1;
  color: var(--text);
}

.main h1 {
  margin-top: 1rem;
  font-weight: bold;
  font-size: 3rem;
  color: var(--text);
}

.main h2 {
  margin-top: 1rem;
  font-weight: normal;
  color: var(--textFancy);
}

.viz-cards {
  padding-bottom: 1rem;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
  gap: 2rem;
}

.one-viz {
  margin-bottom: 1rem;
}

.preamble {
  display: flex;
}

.top {
  margin-top: 1rem;
}

.colophon {
  padding: 2rem 2rem 1rem 5rem;
  text-align: right;
  font-size: 0.85rem;
  background-color: white;
}

.main {
  max-width: 64rem;
}

.main .top a {
  font-size: 0.9rem;
}

.page-area {
  display: flex;
  flex-direction: row-reverse;
}

.headline {
  font-size: 2rem;
  line-height: 2.7rem;
  padding: 1rem 0;
  color: $themeColor;
}

#app .footer {
  color: #222;
  background-color: white;
  text-align: center;
  padding: 2rem 0.5rem 3rem 0.5rem;
}

.footer a {
  color: $matsimBlue;
}

.footer img {
  margin: 1rem auto;
  padding: 0 1rem;
}

.tu-logo {
  margin-top: -4rem;
  text-align: right;
  margin-right: 2rem;
}

.img-logo {
  height: 8rem;
}

@media only screen and (max-width: 640px) {
  .banner {
    padding: 2rem 1rem;
  }

  .content {
    padding: 2rem 1rem 8rem 1rem;
    flex-direction: column-reverse;
  }

  .colophon {
    display: none;
  }

  .headline {
    padding: 0rem 0rem 1rem 0rem;
    font-size: 1.5rem;
    line-height: 1.8rem;
  }

  .tu-logo {
    margin-top: -2rem;
    text-align: right;
    margin-right: 0.5rem;
  }

  .img-logo {
    height: 4rem;
  }
}
</style>

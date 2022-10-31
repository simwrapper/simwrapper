<template lang="pug">
#home
  h3 Starting trip locations by time of day: {{ clockTime }}

  .labels
    p(style="flex: 1") SQL Example Two — SQLite
    p Trips: {{ rows.length ? rows[0].values.length : 0 }}

  vue-slider(v-model="minute" :max="1439" @change="update" tooltip="none")

  hr

  .results
    scatter-plot.plot(:data="rows.length ? rows[0].values : []" :initialView="{ zoom: 6, longitude: 14, latitude: 52}")

</template>

<script lang="ts">
import { Vue, Component, Prop, Watch } from 'vue-property-decorator'
import { createDbWorker, WorkerHttpvfs } from 'sql.js-httpvfs'
import VueSlider from 'vue-slider-component'
import 'vue-slider-component/theme/default.css'
import { VuePlugin } from 'vuera'

import ScatterPlot from '@/components/deckgl/ScatterPlotLayer'

Vue.use(VuePlugin)

@Component({ components: { ScatterPlot, VueSlider } as any })
class MyComponent extends Vue {
  private rows: any[] = []
  private minute = 0
  private worker!: WorkerHttpvfs

  private config = {
    from: 'inline',
    config: {
      serverMode: 'full', // file is just a plain old full sqlite database
      requestChunkSize: 1024, // the page size of the  sqlite database (by default 4096)
      url: 'http://localhost:8000/berlin/outputs.sqlite', // url to the database (relative or full)
    },
  } as any

  private mounted() {
    this.loadSql()
  }

  private async loadSql() {
    const workerUrl = '/sqlite.worker.js'
    const wasmUrl = '/sql-wasm.wasm'

    this.worker = await createDbWorker([this.config], workerUrl.toString(), wasmUrl.toString())
    this.update()
  }

  private get clockTime() {
    const hour = Math.floor(this.minute / 60)
    const minute = this.minute - hour * 60
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  }

  private async update() {
    const result = await this.worker.db.exec(
      `select main_mode, start_x, start_y from trips where seconds >= ? and seconds < ?`,
      [this.minute * 60, this.minute * 60 + 60]
    )

    this.rows = result
    // console.log(result)
  }
}

export default MyComponent
</script>

<style scoped lang="scss">
@import '@/styles.scss';

#home {
  padding: 1rem 1rem;
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
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

.results {
  border: 1px solid #ccc;
  position: relative;
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

.plot {
  width: 100%;
  height: 650px;
  background-color: var(--bgBold);
}

.labels {
  font-size: 1.4rem;
  color: green;
  font-weight: bold;
  display: flex;
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

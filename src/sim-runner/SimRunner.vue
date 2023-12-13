<template lang="pug">
.panel
  .scrolly
    .middle-panel
      h4 {{ server.serverNickname }} - Run Launcher

      .hint(v-if="!server.serverNickname")
        p: b Select a server resource.
        p Or add a new SimWrapper cloud server resource if you have access to one.

      .new-run(v-if="server.serverNickname && !runId")
          //- h3(v-if="!isLoading" style="margin-top: 1rem") Create new run
          p(v-if="statusMessage"): b {{ statusMessage }}

          b-button(v-if="!statusMessage" type="is-warning" @click="clickedNewRun") Create new run&nbsp;&nbsp;
            i.fa(v-if="isShowingRunTemplate").fa-arrow-down
            i.fa(v-else).fa-arrow-right

          .new-run-template(v-if="isShowingRunTemplate")
            b Project folder
            b-input.b-input(v-model="jobProject" size="is-small" placeholder="/project" maxlength="255")
            b QSUB script
            b-input.b-input(v-model="jobScript" size="is-small" placeholder="run-model.sh" maxlength="255")
            b Files
            drop-file(:server="server" @files="filesUpdated")
            b-button(type="is-link" @click="submitRun"): b Launch Run

      .flex-column(v-if="runId")

        sim-run-details(:runId="runId" :server="server")

      .flex-column(v-if="server.serverNickname && !runId")

        h3(style="margin-top: 1rem") List of runs

        .connect-here(v-if="jobs.length")
          vue-good-table.vue-good-table(
            :columns="jobColumns()"
            :rows="jobs"
            styleClass="vgt-table striped condensed"
            @on-row-click="rowClicked"
          )



</template>

<script lang="ts">
const BASE_URL = import.meta.env.BASE_URL

const i18n = {
  messages: {
    en: {},
    de: {},
  },
}

import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import { VueGoodTable } from 'vue-good-table'

import globalStore from '@/store'
import DropFile from './DropFile.vue'
import SimRunDetails from './SimRunDetails.vue'

import 'vue-good-table/dist/vue-good-table.css'

const STATUS = ['Draft', 'Queued', 'Preparing', 'Launched', 'Complete', 'Cancelled', 'Error']

export default defineComponent({
  name: 'SimRunner',
  i18n,
  components: { DropFile, SimRunDetails, VueGoodTable },
  data: () => {
    return {
      globalState: globalStore.state,
      servers: {} as { [id: string]: { serverNickname: string; url: string; key: string } },
      server: {} as { serverNickname: string; url: string; key: string },
      isLoading: true,
      isShowingRunTemplate: false,
      jobs: [] as any,
      jobScript: '',
      jobProject: '',
      files: [] as any[],
      statusMessage: '',
      runId: '',
    }
  },
  mounted() {
    this.$store.commit('setShowLeftBar', true)
    const servers = localStorage.getItem('simrunner-servers') || '{}'
    this.servers = JSON.parse(servers)

    // figure out page path
    const pagePath = this.$route.params.pathMatch.substring(5).split('/')
    console.log({ pagePath })

    const serverId = pagePath[0]
    if (!serverId) return

    this.server = this.servers[serverId]
    if (!this.server) console.error('NO SERVER:' + serverId)

    this.runId = pagePath[1] || ''

    // no runId: build summary page
    this.buildSummaryPage()
  },

  watch: {},
  computed: {},

  methods: {
    jobColumns() {
      if (!this.jobs.length) return []
      const columns = Object.keys(this.jobs[0])
      return columns.map(k => {
        return { label: k, field: k }
      })
    },

    async buildSummaryPage() {
      // Get list of jobs
      const cmd = `${this.server.url}/jobs/`
      const allJobs: any[] = await fetch(cmd, {
        headers: { Authorization: this.server.key, 'Content-Type': 'application/json' },
      }).then(response => response.json())
      console.log(allJobs)
      const cleanJobs = allJobs.map(row => {
        row.status = STATUS[row.status]
        return row
      })
      // reverse sort
      cleanJobs.sort((a, b) => (a.id > b.id ? -1 : 1))

      this.jobs = cleanJobs
      this.isLoading = false
    },

    rowClicked(event: any) {
      console.log(event.row)
      this.$router.push(`${this.server.serverNickname}/${event.row.id}`)
      const pagePath = this.$route.params.pathMatch.substring(5).split('/')
      console.log({ pagePath })

      if (pagePath.length > 2) this.runId = pagePath[1] || ''
    },

    cleanName(text: string) {
      return decodeURIComponent(text)
    },

    clickedNewRun() {
      this.isShowingRunTemplate = !this.isShowingRunTemplate
    },

    filesUpdated(files: any[]) {
      console.log('GOT YOU', files)
      this.files = files
    },

    async submitRun() {
      console.log('SUBMIT!')
      console.log(this.files)
      if (!this.files.length) return
      if (!this.jobScript) return

      // First, create the run
      this.statusMessage = 'Creating job...'
      const headers = {
        'Content-Type': 'application/json',
        Authorization: this.server.key,
      }
      let project = this.cleanName(this.jobProject)
      if (project.startsWith('/')) project = project.slice(1)
      if (project.endsWith('/')) project = project.slice(0, -1)

      const data = {
        script: this.jobScript,
        project,
      }

      const job_id = await fetch(`${this.server.url}/jobs/`, {
        method: 'POST',
        body: JSON.stringify(data),
        headers,
      }).then(r => r.json())
      console.log({ job_id })

      // Then, upload the files
      this.statusMessage = 'Uploading files...'
      for (const file of this.files) {
        this.statusMessage = 'Uploading files... ' + file.name
        const formData = new FormData()
        formData.append('file', file)
        formData.append('job_id', job_id)
        const result = await fetch(`${this.server.url}/files/`, {
          method: 'POST',
          headers: { Authorization: this.server.key },
          body: formData,
        })
        const result2 = await result.json()
      }

      // Then, add to queue
      this.statusMessage = 'Adding to queue...'
      const result3 = await fetch(`${this.server.url}/jobs/${job_id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 1 }),
        headers,
      }).then(r => r.json())
      console.log({ result3 })

      // update table
      this.statusMessage = ''
      this.isLoading = true
      this.isShowingRunTemplate = false
      this.buildSummaryPage()
    },
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.panel {
  display: flex;
  flex-direction: column;
  padding-top: 0.25rem;
  user-select: none;
  font-size: 1rem;
  background-color: var(--bgPanel);
}

.scrolly {
  overflow-y: auto;
}

.top-panel {
  display: flex;
  flex-direction: column;
  margin: 0.25rem 1rem 1rem 1rem;
}

h4 {
  background-image: linear-gradient(45deg, #481e83, #129eb3);
  text-transform: uppercase;
  text-align: center;
  padding: 0.5rem 0.5rem;
  margin-top: 0.25rem;
  margin-bottom: 0.25rem;
  font-weight: bold;
  text-transform: uppercase;
  color: #ddd;
}

.middle-panel,
.bottom-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  margin: 0 auto;
  padding: 0 1rem;
  text-align: left;
  user-select: none;
  max-width: 70rem;

  h1 {
    letter-spacing: -1px;
  }
  h3 {
    font-size: 1.2rem;
    // border-bottom: 1px solid #cccccc80;
    margin-top: 0rem;
    margin-bottom: 0.25rem;
  }

  p,
  a {
    max-width: 100%;
    overflow-wrap: break-word;
  }
}

.bottom-panel {
  padding: 0 0.5rem 0.25rem 0.5rem;
  flex: unset;
}

.white {
  background-color: var(--bgBold);
}

.cream {
  background-color: var(--bgCream);
}

h2 {
  font-size: 1.8rem;
}

.badnews {
  border-left: 3rem solid #af232f;
  margin: 0rem 0rem;
  padding: 0.5rem 0rem;
  background-color: #ffc;
  color: $matsimBlue;
}

.viz-frame-component {
  background-color: var(--bgPanel);
}

.folder-table {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 0.5rem;
}

.folder {
  cursor: pointer;
  display: flex;
  flex-direction: row;
  background-color: #14141a;
  color: #c6c1b9;
  line-height: 1.05rem;
  padding: 5px 7px;
  border-radius: 4px;
  word-wrap: break-word;

  i {
    margin-top: 1px;
  }
  p {
    margin-left: 4px;
  }
}

.folder:hover {
  background-color: #21516d;
  transition: background-color 0.08s ease-in-out;
}

.fade {
  opacity: 0.4;
  pointer-events: none;
}

.flex-column {
  display: flex;
  flex-direction: column;
}

.curate-heading {
  padding: 0rem 0rem;
  margin: 0rem 0rem;
}

.curate-content {
  margin-bottom: 2rem;
}

.fa-arrow-up {
  margin-right: 2px;
}

.flex-row {
  display: flex;
  flex-direction: row;
}

.config-sources a:hover {
  cursor: pointer;
  color: var(--linkHover);
}

.highlighted {
  background-color: var(--bgHover);
}

.fa-times {
  opacity: 0;
  float: right;
  padding: 1px 1px;
}

.fa-times:hover {
  color: red;
}

.fa-times:active {
  color: darkred;
}

.project-root:hover .fa-times {
  opacity: 0.15;
}

.project-root:hover .fa-times:hover {
  opacity: 1;
}

.b-input {
  margin-bottom: 0.5rem;
}

.new-run {
  margin-top: 1.25rem;
}

.new-run-template {
  margin: 1px 0px;
  padding: 0.5rem 0.5rem;
  background-color: #ccccee33;
  border: 1px solid #aaaaaa44;
}
.hint {
  margin-top: 2rem;
}
</style>

<style lang="scss">
.vgt-table,
.vgt-wrap__footer,
.footer__row-count__label,
.footer__row-count__select,
.footer__navigation__page-info,
.footer__navigation__page-btn span {
  font-size: 13px !important;
}
</style>

<template lang="pug">
.mpanel
  .scrolly
    .middle-panel
      h2 {{ server.serverNickname }}

      .hint(v-if="!server.serverNickname")
        p: b Select a server resource on the left.
        p You can connect to any SimWrapper cloud server resources you have access to.

      .flex-col(v-if="server.serverNickname && !runId")
        .summary-stats.flex-row
          .flex-col.flex1
            p: b Current Load (ILS only)
            p
              b {{ summaryStats.runCPUS }}
              | &nbsp;CPUs running
            p
              b {{ summaryStats.runGB }} GB
              | &nbsp;memory allocated
          .flex-col.flex1
            p: b Queued Jobs (ILS only)
            p
              b {{ summaryStats.queueCPUS }}
              | &nbsp;CPUs requested
            p
              b {{ summaryStats.queueGB }} GB
              | &nbsp;memory requested

      .new-run(v-if="server.serverNickname && !runId")
          //- h3(v-if="!isLoading" style="margin-top: 1rem") Create new run
          p(v-if="statusMessage"): b {{ statusMessage }}

          b-button(v-if="!statusMessage" type="is-danger" @click="clickedNewRun") Create new run&nbsp;&nbsp;
            i.fa(v-if="isShowingRunTemplate").fa-arrow-down
            i.fa(v-else).fa-arrow-right

          .new-run-template(v-if="isShowingRunTemplate")
            b-button.float-right(type="is-success" @click="submitRun" style="marginBottom: 0.5rem")
              b Launch Run

            b Command / script
            b-input.b-input(v-model="jobScript" size="is-small" placeholder="run-model.sh" maxlength="255")

            b Project folder
            b-input.b-input(v-model="jobProject" size="is-small" placeholder="/project" maxlength="255")

            b TU Compute cluster settings
            .flex-row
              .flex-col.flex1
                p Email
                b-input.b-input(v-model="clusterEmail" size="is-small" placeholder="me@tu-berlin.de" maxlength="255")
              .flex-col.flex1
                p Number of processors
                b-input.b-input(v-model="clusterProcessors" size="is-small" placeholder="4" maxlength="20")
              .flex-col.flex1
                p Memory per processor
                b-input.b-input(v-model="clusterRAM" size="is-small" placeholder="16g" maxlength="20")

            b Files
            .flex-row
              table.detail-table.flex1
                tr.job-row(v-for="file in files" :key="file.name")
                  td.file-param(style="text-align: right") {{ getFileSize(file) }}
                  td.file-param-value: b(:class="{'loading': file.isUploading}") {{ file.name }}

              drop-file(@files="filesUpdated")

      .flex-col(v-if="runId")
        sim-run-details(:runId="runId" :server="server")

      .flex-row(v-if="server.serverNickname && !runId" style="gap: 1rem;")

       .flex-col.flex1.mb1
          h3(style="margin-top: 2rem") RUNNING
          .run(v-for="job in jobsRunning" :key="job.JOBID" @click="rowClicked({row: job})")
            p
              b {{ job.USER }}:&nbsp;
              | Job {{ job.JOBID}},&nbsp;
              | {{ job.MIN_MEMORY }} Memory,
              | {{ job.CPUS }} CPUs,
              | {{ job.NODES }} Node{{ job.NODES > 1 ? 's' : ''}}

            p.ml1
              b.mr1(style="color: var(--link);") {{ job.ELAPSED_TIME ? `Elapsed: ${job.ELAPSED_TIME}` : '' }}
            p.ml1
              span.mr1(style="color: purple") Started: {{ job.START_TIME}}
              span.mr1(style="color: green") Submitted: {{ job.SUBMIT_TIME }}

            p.ml1.cmdline {{ job.COMMAND }}

      //-  .flex-col.flex1
      //-     h3(style="margin-top: 2rem") QUEUED
      //-     .run(v-for="job in jobsQueued" :key="job.JOBID" @click="rowClicked({row: job})")
      //-       p
      //-         b {{ job.USER }}:&nbsp;
      //-         | Job {{ job.JOBID}},&nbsp;
      //-         | {{ job.MIN_MEMORY }} Memory,
      //-         | {{ job.CPUS }} CPUs,
      //-         | {{ job.NODES }} Node{{ job.NODES > 1 ? 's' : ''}}

      //-       p.ml1
      //-         span.mr1(style="color: green") Submitted: {{ job.SUBMIT_TIME }}

      //-       p.ml1.cmdline {{ job.COMMAND }}


      .connect-here(v-if="jobs.length")
        vue-good-table.vue-good-table(
          :class="{'darktable': isDark}"
          :columns="jobColumns()"
          :rows="jobs"
          styleClass="vgt-table striped condensed"
          @on-row-click="rowClicked"
        )

</template>

<script lang="ts">
const i18n = {
  messages: {
    en: {},
    de: {},
  },
}

import { defineComponent } from 'vue'
import { filesize } from 'filesize'
import Papa from '@simwrapper/papaparse'
import { VueGoodTable } from 'vue-good-table'
import 'vue-good-table/dist/vue-good-table.css'

import { Temporal, Intl, toTemporalInstant } from '@js-temporal/polyfill'
//@ts-ignore
Date.prototype.toTemporalInstant = toTemporalInstant

import globalStore from '@/store'
import DropFile from './DropFile.vue'
import SimRunDetails, { FileEntry } from './SimRunDetails.vue'

interface ServerDetails {
  serverNickname: string
  url: string
  key: string
  rootFolder?: string
}

export const JOBSTATUS = [
  'Draft', // 0
  'Submitted', // 1
  'Preparing', // 2
  'Queued', // 3
  'Running', // 4
  'Complete', // 5
  'Cancelled', // 6
  'Error', // 7
]

export const SQUEUE_STATUS: any = {
  BF: 'Error',
  CA: 'Cancelled',
  CD: 'Complete',
  CF: 'Preparing',
  CG: 'Running',
  DL: 'Cancelled',
  F: 'Error',
  NF: 'Error',
  OOM: 'Error',
  PD: 'Submitted',
  PR: 'Cancelled',
  R: 'Running',
  RD: 'Submitted',
  SO: 'Running',
  ST: 'Cancelled',
  S: 'Queued',
  TO: 'Cancelled',
}

export default defineComponent({
  name: 'SimRunner',
  i18n,
  components: { DropFile, SimRunDetails, VueGoodTable },
  data: () => {
    return {
      globalState: globalStore.state,
      servers: {} as { [id: string]: ServerDetails },
      server: {} as ServerDetails,
      isLoading: true,
      isShowingRunTemplate: false,
      jobs: [] as any[],
      jobScript: '',
      jobProject: '',
      files: [] as any[],
      statusMessage: '',
      runId: '',
      clusterEmail: '',
      clusterProcessors: 2,
      clusterRAM: '4g',
      summaryStats: { runCPUS: 0, runGB: 0, queueCPUS: 0, queueGB: 0 },
      cbRefresher: null as any,
    }
  },

  beforeDestroy() {
    clearInterval(this.cbRefresher)
  },

  mounted() {
    this.$store.commit('setShowLeftBar', true)
    const servers = localStorage.getItem('simrunner-servers') || '{}'
    this.servers = JSON.parse(servers)

    // figure out page path
    const pagePath = this.$route.params.pathMatch.substring(5).split('/')
    const serverId = pagePath[0]

    if (!serverId) return

    this.server = this.servers[serverId]
    if (!this.server) console.error('NO SERVER:' + serverId)

    this.runId = pagePath[1] || ''

    this.$store.commit('setWindowTitle', `${serverId} — SimWrapper Run Manager`)

    // no runId: build summary page
    if (!this.runId) {
      this.cbRefresher = setInterval(this.buildSummaryPage, 75 * 1000)
      this.buildSummaryPage()
    }
  },

  watch: {},
  computed: {
    isDark() {
      return this.$store.state.isDarkMode
    },

    jobsRunning() {
      return this.jobs
        .filter(job => {
          return ['R', 'CF', 'CG'].includes(job.ST)
        })
        .sort((a, b) => (a.JOBID < b.JOBID ? -1 : 1))
    },

    jobsQueued() {
      return this.jobs.filter(job => {
        return ['S', 'PD', 'RD'].includes(job.ST)
      })
    },

    jobsOther() {
      return this.jobs.filter(job => {
        return !['R', 'CF', 'CG', 'S', 'PD', 'RD'].includes(job.ST)
      })
    },
  },

  methods: {
    jobColumns() {
      if (!this.jobs.length) return []
      const columns = Object.keys(this.jobs[0])
      return columns.map(k => {
        return { label: k, field: k }
      })
    },

    getFileSize(f: FileEntry) {
      if (f.isUploading) return '....'
      return filesize(f.size_of || f.size || 0, { round: 2, standard: 'si' })
    },

    async buildSummaryPage() {
      // Get list of jobs
      const cmd = `${this.server.url}/squeue_jobs/`
      const tsv = await fetch(cmd, {
        headers: {
          Authorization: this.server.key,
          'Content-Type': 'application/json',
          'cache-control': 'no-cache',
          pragma: 'no-cache',
        },
      })
      const json = await tsv.json()

      // console.log(json.squeue)

      if (!json.squeue?.length) {
        this.jobs = []
        return
      }

      // convert csv to table
      const parse = Papa.parse(json.squeue, {
        delimiter: ',',
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
      })
      const allJobs = parse.data

      const now = Temporal.Now.plainDateTimeISO()

      // Summary metricvalues
      let runGB = 0
      let runCPUS = 0
      let queueGB = 0
      let queueCPUS = 0

      const cleanJobs = allJobs.map((row: any) => {
        row.status = SQUEUE_STATUS[row.ST]

        // calc elapsed time
        try {
          const start = Temporal.PlainDateTime.from(row.START_TIME)
          const since = now.since(start)

          row.ELAPSED_TIME =
            `${since.days ? since.days + 'd ' : ''}` +
            `${since.hours}h ` +
            `${since.minutes}`.padStart(2, '0') +
            'm'
        } catch {}

        // pretty-print ISO datetimes
        row.SUBMIT_TIME = row.SUBMIT_TIME.replace('T', ' • ')
        row.START_TIME = row.START_TIME.replace('T', ' • ')
        row.END_TIME = row.END_TIME.replace('T', ' • ')

        if (row['"COMMAND']) {
          row.COMMAND = row['"COMMAND']
          delete row['"COMMAND']
        }

        // summary stats
        if (['R', 'CF', 'CG'].includes(row.ST)) {
          runCPUS += row.CPUS
          if (row.MIN_MEMORY.endsWith('G')) runGB += parseInt(row.MIN_MEMORY.slice(0, -1))
        }
        if (['S', 'PD', 'RD'].includes(row.ST)) {
          queueCPUS += row.CPUS
          if (row.MIN_MEMORY.endsWith('G')) queueGB += parseInt(row.MIN_MEMORY.slice(0, -1))
        }

        this.summaryStats = {
          runCPUS,
          runGB,
          queueCPUS,
          queueGB,
        }

        return row
      })

      // reverse sort
      cleanJobs.sort((a: any, b: any) => (a.id > b.id ? -1 : 1))

      this.jobs = cleanJobs
      this.isLoading = false
    },

    rowClicked(event: any) {
      this.$router.push(`${this.server.serverNickname}/${event.row.id}`)
      const pagePath = this.$route.params.pathMatch.substring(5).split('/')
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
      this.files = this.files.concat(files)
    },

    async submitRun() {
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
        cEmail: this.clusterEmail,
        cProcessors: this.clusterProcessors,
        cRAM: this.clusterRAM,
      }

      // POST -draft- job to server
      const job_id = await fetch(`${this.server.url}/jobs/`, {
        method: 'POST',
        body: JSON.stringify(data),
        headers,
      }).then(r => r.json())
      console.log({ job_id })

      // Upload the files
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

      // Add job to run queue
      this.statusMessage = 'Adding to queue...'
      const result3 = await fetch(`${this.server.url}/jobs/${job_id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 1 }), // "submitted"
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

.mpanel {
  display: flex;
  flex-direction: column;
  padding-top: 0.25rem;
  user-select: none;
  font-size: 1rem;
  background-image: var(--gradientEthereal);
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
  // max-width: 70rem;

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

.middle-panel {
  margin-top: 0.5rem;
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
  margin-top: 2rem;
}

.new-run-template {
  margin: 1px 0px;
  padding: 0.5rem 0.5rem;
  background-color: #9a9ab433;
  border: 1px solid #aaaaaa44;
}
.hint {
  margin-top: 2rem;
}

.summary-stats {
  margin-top: 1rem;
  padding: 0.5rem;
  background-color: var(--bgError);
  color: #357;
  border: 1px solid #88888860;
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

.darktable table.vgt-table {
  border: none;
}

.darktable .vgt-table thead th {
  color: var(--textBold);
  background-color: var(--bgMapPanel) !important;
  background: none;
  border: none;
}

.darktable .vgt-table.striped tbody tr:nth-of-type(odd) {
  background-color: #212121 !important;
}

.darktable .vgt-table.striped tbody tr:nth-of-type(even) {
  background-color: var(--bgMapPanel) !important;
}

.darktable .vgt-table td {
  color: var(--text);
  border-color: var(--bgMapPanel);
}

.darktable .vgt-wrap__footer {
  background: none;
  border: none;
  color: var(--textBold);
}

.darktable .footer__row-count__select {
  color: var(--text);
}

.darktable .footer__navigation__page-info {
  color: var(--text);
}

.darktable .footer__navigation__page-btn {
  color: var(--text);
}

.darktable .vgt-input {
  height: 24px;
  font-size: 12px;
  color: var(--textBold);
  background-color: #212121;
  border: none;
}

.darktable .vgt-input::placeholder {
  color: var(--textBold);
}

.file-param {
  white-space: nowrap;
}

.file-param-value {
  width: 100%;
  padding-left: 1rem;
  white-space: nowrap;
}

.detail-table {
  table-layout: auto;
  margin-top: 1rem;
  margin-bottom: auto;
}

.run {
  margin: 0.25rem 0;
  padding: 0.5rem;
  background-color: var(--bgBold);
  border-radius: 5px;
  cursor: pointer;
}

.run:hover {
  filter: drop-shadow(0px 0px 4px #22222244);
}

.cmdline {
  line-height: 1.3rem;
  color: var(--link);
}
</style>

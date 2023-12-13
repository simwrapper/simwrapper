<template lang="pug">
.panel

  h2(style="margin-top: 1rem") Run {{ runId }}

  table.detail-table
    tr.job-row(v-for="kv in Object.entries(this.job)" :key="kv[0]")
      td.job-param {{ kv[0] }}
      td.job-param-value: b {{  kv[1] }}


  .files-table(v-if="files.length")
    h3 Files

    table.detail-table
      tr.job-row(v-for="fileEntry in files" :key="fileEntry.name")
        td.job-param {{ fileEntry.name }}
        td.job-param-value {{  getFileSize(fileEntry.sizeof) }}

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
import { filesize } from 'filesize'

import globalStore from '@/store'
import DropFile from './DropFile.vue'

import 'vue-good-table/dist/vue-good-table.css'

const STATUS = ['Draft', 'Queued', 'Preparing', 'Launched', 'Complete', 'Cancelled', 'Error']

export default defineComponent({
  name: 'SimRunDetails',
  i18n,
  components: { DropFile, VueGoodTable },

  props: {
    runId: { type: String, required: true },
    server: { type: Object, required: true },
  },

  data: () => {
    return {
      globalState: globalStore.state,
      isLoading: true,
      isShowingRunTemplate: false,
      job: {} as any,
      jobScript: '',
      jobProject: '',
      files: [] as any[],
      statusMessage: '',
    }
  },
  mounted() {
    this.$store.commit('setShowLeftBar', true)

    this.getJobDetails()
    this.getFileList()
  },

  watch: {},
  computed: {},

  methods: {
    getFileSize(f: any) {
      return filesize(f, { round: 2, standard: 'si' })
    },

    async getJobDetails() {
      const cmd = `${this.server.url}/jobs/?id=${this.runId}`
      let job: any[] = await fetch(cmd, {
        headers: { Authorization: this.server.key, 'Content-Type': 'application/json' },
      }).then(response => response.json())
      if (job.length == 1) {
        this.job = job[0]
        if ('status' in this.job) this.job.status = STATUS[this.job.status]
      } else {
        console.error('JOB NOT FOUND')
      }
    },

    jobColumns() {
      return []
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

      // this.jobs = cleanJobs
      this.isLoading = false
    },

    async getFileList() {
      const cmd = `${this.server.url}/files/?job_id=${this.runId}`
      const allFiles: any[] = await fetch(cmd, {
        headers: { Authorization: this.server.key, 'Content-Type': 'application/json' },
      }).then(response => response.json())

      console.log({ allFiles })
      this.files = allFiles
    },

    clickedNewRun() {
      this.isShowingRunTemplate = !this.isShowingRunTemplate
    },

    filesUpdated(files: any[]) {
      console.log('GOT YOU', files)
      this.files = files
    },

    cleanName(text: string) {
      return decodeURIComponent(text)
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

.detail-table {
  table-layout: auto;
  margin-top: 1rem;
}

.job-param {
  text-align: right;
  padding-right: 0.75rem;
  white-space: nowrap;
}
.job-param-value {
  width: 100%;
}

.files-table {
  margin-top: 2rem;
}

h3 {
  text-transform: uppercase;
}
</style>

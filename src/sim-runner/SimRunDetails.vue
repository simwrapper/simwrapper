<template lang="pug">
.xpanel

  h2(style="margin-top: 1rem") Run {{ runId }}
    b-button.button-run-again.floatright(
      v-if="job.status && 'Draft' !== job.status"
      type="is-warning"
      @click="clickedRunAgain"
    ) Run again...
    b-button.button-run-again.floatright(
      v-if="'Draft' == job.status"
      type="is-success"
      @click="clickedLaunch"
    ) Launch Run

  table.detail-table
    tr.job-row(v-for="kv in Object.entries(this.job)" :key="kv[0]")
      //- fieldname
      td.job-param {{ kv[0] }}

      //- read-only value
      td.job-param-value(v-if="job.status && 'Draft' !== job.status")
        b(:style="getFormat(kv)") {{  kv[1] }}

      //- editable value for draft jobs
      td.job-param-value(v-else-if="'Draft'==job.status && !editableFields.has(kv[0])")
        b(:style="getFormat(kv)") {{  kv[1] }}

      td.job-param-value(v-else)
        b: editable-field(
             style="backgroundColor: #ffffff88; margin-bottom: 1px"
             :label="kv[1]"
             v-model="job[kv[0]]"
             @input="handleFieldChanged(kv[0])"
           )

  .files-table
    h3 Files

    .flex-row
      table.detail-table.flex1
        tr.job-row(v-for="file in Object.values(files)" :key="file.name")
          td.file-param(style="text-align: right") {{ getFileSize(file) }}
          td.file-param-value: b(:class="{'loading': file.isUploading}") {{ file.name }}

      drop-file.dropfile.flex1(v-if="showDropZone && job.status == 'Draft'"
        :isUploading="!!isUploadingRightNow.size"
        @files="handleFilesAdded"
      )

</template>

<script lang="ts">
export interface FileEntry {
  name: string
  job_id: string
  id?: string
  size_of?: number
  size?: number // GET RID OF THIS
  isUploading: boolean
}

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
import EditableField from '@/components/EditableField.vue'

import 'vue-good-table/dist/vue-good-table.css'

import { JOBSTATUS } from './SimRunner.vue'

export default defineComponent({
  name: 'SimRunDetails',
  i18n,
  components: { DropFile, EditableField, VueGoodTable },

  props: {
    runId: { type: String, required: true },
    server: { type: Object, required: true },
  },

  data: () => {
    return {
      globalState: globalStore.state,
      editableFields: new Set(['project', 'script', 'cRAM', 'cProcessors', 'cEmail']),
      files: {} as { [name: string]: FileEntry },
      isLoading: true,
      isUploadingRightNow: new Set(),
      isShowingRunTemplate: false,
      job: {} as any,
      jobScript: '',
      jobProject: '',
      showDropZone: true,
      statusMessage: '',
    }
  },
  mounted() {
    this.$store.commit('setShowLeftBar', true)
    this.setupPage()
  },

  watch: {},
  computed: {},

  methods: {
    async setupPage() {
      await this.getJobDetails()
      await this.getFileList()
    },

    getFileSize(f: FileEntry) {
      if (f.isUploading) return '....'
      return filesize(f.size_of || 0, { round: 2, standard: 'si' })
    },

    getFormat(kv: any[]) {
      const [key, value] = kv
      const style = { padding: '1px 3px' } as any
      if (key == 'status') {
        style.color = 'white'
        switch (value) {
          case 'Draft':
            style.backgroundColor = 'blue'
            break
          case 'Error':
          case 'Cancelled':
            style.backgroundColor = 'red'
            break
          case 'Submitted':
          case 'Preparing':
          case 'Queued':
            style.backgroundColor = '#68f'
            break
          case 'Running':
            style.backgroundColor = 'blueviolet'
            break
          case 'Complete':
            style.backgroundColor = 'green'
            break
          default:
            style.backgroundColor = 'orange'
            break
        }
      }
      return style
    },

    async getJobDetails() {
      const cmd = `${this.server.url}/jobs/?id=${this.runId}`
      let nice = {} as any
      let job: any[] = await fetch(cmd, {
        headers: { Authorization: this.server.key, 'Content-Type': 'application/json' },
      }).then(response => response.json())

      if (job.length == 1) {
        nice = job[0]
        if ('status' in nice) nice.status = JOBSTATUS[nice.status]
      } else {
        console.error('JOB NOT FOUND')
      }
      const {
        status,
        project,
        folder,
        start,
        script,
        qsub_id,
        owner,
        id,
        cRAM,
        cProcessors,
        cEmail,
      } = nice

      // friendly order
      this.job = {
        status,
        project,
        script,
        cRAM,
        cProcessors,
        cEmail,
        folder,
        start,
        qsub_id,
        owner,
        run_id: id,
      }
    },

    jobColumns() {
      return []
    },

    async handleFieldChanged(field: string) {
      const body = {} as any
      body[field] = this.job[field]

      const cmd = `${this.server.url}/jobs/${this.runId}`
      const result = await fetch(cmd, {
        method: 'PUT',
        headers: { Authorization: this.server.key, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(response => response.json())
    },

    async clickedLaunch() {
      console.log('3-2-1 LAUNCH!')
      this.statusMessage = 'Adding to queue...'
      const result3 = await fetch(`${this.server.url}/jobs/${this.runId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 1 }),
        headers: { Authorization: this.server.key, 'Content-Type': 'application/json' },
      }).then(r => r.json())

      this.$router.push(`../${this.server.serverNickname}`)
    },

    async clickedRunAgain() {
      console.log('click!', this.job)

      // Make new run
      const { project, script, cRAM, cEmail, cProcessors, ...stuff } = this.job

      const cmd = `${this.server.url}/jobs/`
      const jobID = await fetch(cmd, {
        method: 'POST',
        headers: { Authorization: this.server.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ project, script, cRAM, cEmail, cProcessors }),
      }).then(response => response.json())
      console.log('NEW JOB:', jobID)

      // Link files to new job
      for (const file of Object.values(this.files)) {
        const body = { ...file }
        delete body.id // old file ID
        body.job_id = jobID // new job ID

        const cmd = `${this.server.url}/files/`
        const fileID = await fetch(cmd, {
          method: 'POST',
          headers: { Authorization: this.server.key, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }).then(response => response.json())
        console.log('NEW FILE:', fileID)
      }

      // Navigate to the new job
      this.$router.push(`${jobID}`)
    },

    async buildSummaryPage() {
      // Get list of jobs
      const cmd = `${this.server.url}/jobs/`
      const allJobs: any[] = await fetch(cmd, {
        headers: { Authorization: this.server.key, 'Content-Type': 'application/json' },
      }).then(response => response.json())
      const cleanJobs = allJobs.map(row => {
        row.status = JOBSTATUS[row.status]
        return row
      })
      // reverse sort
      cleanJobs.sort((a, b) => (a.id > b.id ? -1 : 1))

      // this.jobs = cleanJobs
      this.isLoading = false
    },

    async getFileList() {
      const cmd = `${this.server.url}/files/?job_id=${this.runId}`
      const allFiles: FileEntry[] = await fetch(cmd, {
        headers: { Authorization: this.server.key, 'Content-Type': 'application/json' },
      }).then(response => response.json())

      for (const file of allFiles) this.files[file.name] = file
      this.sortFiles()
    },

    sortFiles() {
      const keys = Object.keys(this.files)
      keys.sort((a, b) => (a.toLocaleLowerCase() < b.toLocaleLowerCase() ? -1 : 1))
      const sortedFiles = {} as any
      for (const key of keys) sortedFiles[key] = this.files[key]
      this.files = sortedFiles
    },

    clickedNewRun() {
      this.isShowingRunTemplate = !this.isShowingRunTemplate
    },

    async getExistingFileFromServerOrNull(
      fileSystemObject: File
    ): Promise<null | { hash: string; size_of: number }> {
      // calculate unique SHA-1 hash
      const buffer = await fileSystemObject.arrayBuffer()
      const sha1 = await crypto.subtle.digest('SHA-1', buffer)
      const hashArray = Array.from(new Uint8Array(sha1)) // convert buffer to byte array
      const sha1hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('') // convert bytes to hex string

      // is hash already on server
      const result = await fetch(`${this.server.url}/files/?hash=${sha1hex}`, {
        headers: { 'Content-Type': 'application/json', Authorization: this.server.key },
      }).then(r => r.json())

      if (result.length) {
        console.log('EXISTS!', sha1hex)
        return { hash: result[0].hash, size_of: result[0].size_of }
      }
      return null
    },

    async handleFilesAdded(fileSystemObjects: any[]) {
      console.log('New FILES', fileSystemObjects)

      const uploadKey = Math.random()
      this.isUploadingRightNow.add(uploadKey)

      for (const file of fileSystemObjects) {
        // add new placeholder file to list of files
        this.files[file.name] = {
          isUploading: true,
          name: file.name,
          job_id: this.runId,
          size_of: file.size,
        }
        this.sortFiles()
        await this.$nextTick()

        const existingFile = await this.getExistingFileFromServerOrNull(file)
        if (existingFile) {
          // if it already exists, no need to re-upload
          const result = await fetch(`${this.server.url}/files/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: this.server.key },
            body: JSON.stringify({ name: file.name, job_id: this.runId, ...existingFile }),
          }).then(r => r.json())
          console.log('Referenced existing file', result)
        } else {
          // upload full file
          const formData = new FormData()
          formData.append('file', file)
          formData.append('job_id', this.runId)
          const result = await fetch(`${this.server.url}/files/`, {
            method: 'POST',
            headers: { Authorization: this.server.key },
            body: formData,
          })
          const result2 = await result.json()
          console.log('UPLOADED:', result, result2)
        }

        // mark as complete
        this.files[file.name].isUploading = false
      }

      // reset dropzone form
      this.showDropZone = false
      await this.$nextTick()
      this.showDropZone = true

      this.isUploadingRightNow.delete(uploadKey)
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
      // for (const file of this.files) {
      //   this.statusMessage = 'Uploading files... ' + file.name
      //   const formData = new FormData()
      //   formData.append('file', file)
      //   formData.append('job_id', job_id)
      //   const result = await fetch(`${this.server.url}/files/`, {
      //     method: 'POST',
      //     headers: { Authorization: this.server.key },
      //     body: formData,
      //   })
      //   const result2 = await result.json()
      // }

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

.xpanel {
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
  margin-bottom: auto;
}

.job-param {
  text-align: right;
  padding-right: 0.75rem;
  white-space: nowrap;
}
.job-param-value {
  width: 100%;
  white-space: nowrap;
}

.file-param {
  white-space: nowrap;
}

.file-param-value {
  width: 100%;
  padding-left: 1rem;
  white-space: nowrap;
}

.floatright {
  float: right;
}

.files-table {
  margin-top: 2rem;
}

.button-run-again {
  opacity: 0.9;
}

.button-run-again:active {
  opacity: 1;
}

h3 {
  text-transform: uppercase;
}

b.loading {
  font-style: italic;
  animation: glow 1s infinite alternate;
}

@keyframes glow {
  from {
    color: orange;
    opacity: 0.7;
    // box-shadow: 0 0 10px -10px #aef4af;
  }
  to {
    color: var(--text);
    opacity: 1;
  }
}

.dropfile {
  margin: 1rem 0 auto 1rem;
}
</style>

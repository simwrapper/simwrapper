<template lang="pug">
.dashboard(
  :id="viewId"
  @drop.stop
  :class="{wiide, 'is-panel-narrow': isPanelNarrow, 'is-fullscreen-dashboard': isFullScreenDashboard }"
)
 .row-container.flex-row-reverse(style="height: 100%;")
  .edit-panel(v-if="editMode && currentCard")
    h4(style="margin: 0 3px 4px 0"): b Panel configuration
      span(@click="hideConfigPanel" style="float: right; cursor: pointer;"): i.fa.fa-times
    b-select(expanded placeholder="Select panel type..." style="user-select: none"
      :value="currentCardType"
      @input="changeCardType"
    )
      option(v-for="key of Object.keys(cardSchemas)" :key="key"
        aria-role="listitem"
        :value="key"
      ) {{ cardSchemas[key].label }}

    .all-config-items(v-if="currentCardType")
      .config-item.flex-col(v-for="entry of cardSchemas[currentCardType].entries" :key="entry.id")
        .entry-label(v-if="entry.type != 'boolean'") {{ entry.label }}
        b-input(v-if="entry.type=='text'" size="is-small" :value="currentCard.props[entry.id]" @input="updateEntry(entry,$event)")
        b-checkbox.entry-checkbox(v-if="entry.type=='boolean'"
          :value="currentCard.props[entry.id]"
          @input="updateEntry(entry,$event)"
        ) {{ entry.label}}
        .entry-hint(v-if="entry.hint") {{ entry.hint }}

  .dashboard-content.flex1(
    :class="{wiide, 'is-fullscreen-dashboard': isFullScreenDashboard}"
    :style="dashWidthCalculator"
  )
    .export-modal(v-if="showExport")
      .export-panel
        h3 Dashboard Configuration YAML
          .float-right.i.fa.fa-times(@click="showExport=false")
        p Copy/paste this into a
          b(style="color: var(--link)") &nbsp;dashboard-myname.yaml&nbsp;
          | file:
        .export-content
          p.float-right(@click="copyToClipboard") COPY
          pre {{ exportedYaml() }}

    .dashboard-header.flex-row(v-if="!fullScreenCardId && (title + description)"
      :class="{wiide, 'is-panel-narrow': isPanelNarrow}"
    )
      .flex1
        h2(ref="pageTitle" :class="{'is-editable': editMode}" :contenteditable="editMode ? 'plaintext' : 'false'" v-model="title") {{ title }}
        p.xsubtitle(ref="pageSubtitle" :class="{'is-editable': editMode}" :contenteditable="editMode ? 'plaintext' : 'false'" v-model="description") {{ description }}

      .editable.flex-row(v-if="editMode")

        p(style="margin: auto 0rem") scrollable
        b-switch(type="is-success" v-model="isFullScreenDashboard") fill window

        .drag-to-add(draggable @dragstart="dragStart($event)" @dragend="dragEnd")
          .drag-tile
              i.fa.fa-arrows-alt
              | &nbsp;&nbsp;Drag to add new panel

        b-button.zeep.is-danger.is-outlined(@click="showExport = true; hideConfigPanel()" title="Copy YAML to clipboard") Show config&hellip;
        b-button.zeep.is-danger.is-outlined(@click="performSave" title="Save local file"): i.fa.fa-save

    .tabs.is-centered(v-if="subtabs.length")
      ul.tab-row
        li.tab-entry(v-for="subtab,index of subtabs" :key="index"
          :class="{'is-active': index===activeTab, 'is-not-active': index!==activeTab}"
          :style="{opacity: index===activeTab ? 1.0 : 0.55}"
        )
          b: a(@click="switchTab(index)") {{ subtab.title }}

    //- start row here
    .dash-row(v-for="row,y in rows" :key="y"
        :class="getRowClass(row)"
        :style="{'flex': rowFlexWeights[y] || 1}"
    )

      //- each card here
      .dash-card-frame(v-for="card,x in row.cards" :key="`${y}/${x}`"
        :class="{wiide, 'is-panel-narrow': isPanelNarrow}"
        :ref="`dragContainer${x}-${y}`"
        :style="getCardStyle(card)"
        @drop.stop="onDrop({event: $event,x,y})"
        @dragover="stillDragging({event: $event,x,y})"
        @dragleave="dragEnd"
        @dragover.prevent
        @dragenter.prevent
      )
        .drag-highlight(v-if="isDragHappening" :style="buildDragHighlightStyle(x,y)")

        //- card header/title
        .dash-card-headers(v-if="editMode || (card.title + card.description)"
          :class="{'fullscreen': !!fullScreenCardId, 'is-editing': editMode}"
          @click="editCard(card)"
        )
          .header-labels(:style="{paddingLeft: card.type=='text' ? '4px' : ''}")
            h3 {{ card.title || (editMode ? '(no title)' : '') }}
            p(v-if="card.description") {{ card.description }}

          //- Card titlebar buttons: config / info / zoom / delete
          .header-buttons

            button.button.is-white(style="margin-top: -5px"
              @click="editCard(card)"
              title="Configure"
            ): i.fa.fa-cog

            button.button.is-small.is-white(
              v-if="card.info"
              @click="handleToggleInfoClick(card)"
              :title="infoToggle[card.id] ? 'Hide Info':'Show Info'"
            )
              i.fa.fa-info-circle

            button.button.is-small.is-white(
              v-if="!editMode"
              @click="toggleZoom(card)"
              :title="fullScreenCardId ? 'Restore':'Enlarge'"
            )
              i.fa.fa-expand

            button.button.is-white(
              v-if="editMode"
              style="margin: -5px -5px 0 0"
              @click="deleteCard(card)"
              title="Delete"
            ): i.fa.fa-times

        //- info contents
        .info(v-show="infoToggle[card.id]")
          p
          p {{ card.info }}

        //- card contents
        .spinner-box(v-if="getCardComponent(card)"
          :id="card.id"
          :class="{'is-loaded': card.isLoaded}"
          @dragover="stillDragging({event: $event,x,y})"
        )
          component.dash-card(
            @dragover="stillDragging({event: $event,x,y})"
            :is="getCardComponent(card)"
            :fileSystemConfig="fileSystemConfig"
            :subfolder="row.subtabFolder || xsubfolder"
            :files="fileList"
            :yaml="card.props.configFile"
            :config="card.props"
            :datamanager="datamanager"
            :split="split"
            :style="{opacity: opacity[card.id]}"
            :cardId="card.id"
            :cardTitle="card.title"
            :allConfigFiles="allConfigFiles"
            @isLoaded="handleCardIsLoaded(card)"
            @dimension-resizer="setDimensionResizer"
            @titles="setCardTitles(card, $event)"
            @error="setCardError(card, $event)"
          )
          .error-text(v-if="card.errors.length")
            span.clear-error(@click="card.errors=[]") &times;
            p(v-for="err,i in card.errors" :key="i") {{ err }}

</template>

<script lang="ts">
import Vue, { defineComponent } from 'vue'
import type { PropType } from 'vue'
import { debounce } from 'debounce'
import YAML from 'yaml'
import TOML from 'smol-toml'

import globalStore from '@/store'
import { FileSystemConfig, Status, YamlConfigs } from '@/Globals'
import HTTPFileSystem from '@/js/HTTPFileSystem'

import TopSheet from '@/components/TopSheet/TopSheet.vue'
// import charts, { plotlyCharts } from '@/dash-panels/_allPanels'

import { panelLookup } from '@/dash-panels/_allPanels'
import DashboardDataManager from '@/js/DashboardDataManager'
import { sleep } from '@/js/util'

import CardSchemas, { CardField } from '@/dash-panels/_cardSchemas'

// append a prefix so the html template is legal
const namedCharts = {} as any
const chartTypes = Object.keys(panelLookup)
// const plotlyChartTypes = {} as any

chartTypes.forEach((key: any) => {
  namedCharts[`card-${key}`] = panelLookup[key] // key // charts[key] as any
  // //@ts-ignore
  // if (plotlyCharts[key]) plotlyChartTypes[key] = true
})

export default defineComponent({
  name: 'Dashboard',
  components: Object.assign({ TopSheet }, namedCharts),
  props: {
    root: { type: String, required: true },
    xsubfolder: { type: String, required: true },
    allConfigFiles: { type: Object as PropType<YamlConfigs>, required: true },
    datamanager: { type: Object as PropType<DashboardDataManager>, required: true },
    split: { type: Object, required: true }, // {y,x}
    gist: Object as any,
    config: Object as any,
    zoomed: Boolean,
    editMode: Boolean,
  },
  data: () => {
    return {
      cardSchemas: CardSchemas,
      title: '',
      description: '',
      viewId: 'dashboard-' + Math.floor(1e12 * Math.random()),
      yaml: {} as any,
      rows: [] as { id: string; cards: any[]; subtabFolder?: string }[],
      fileList: [] as string[],
      fileSystemConfig: {} as FileSystemConfig,
      fullScreenCardId: '',
      resizers: {} as { [id: string]: any },
      infoToggle: {} as { [id: string]: boolean },
      isFullScreenDashboard: false,
      isResizing: false,
      opacity: {} as any,
      narrowPanelObserver: null as ResizeObserver | null,
      isPanelNarrow: false,
      numberOfShownCards: 1,
      // subtab state:
      subtabs: [] as any[],
      activeTab: 0,
      dashboardTabWithDelay: -1,
      showFooter: false,
      rowFlexWeights: [] as number[],
      // drag editMode
      dragX: -1,
      dragY: -1,
      dragQuadrant: null as any,
      // | null
      // | string
      // | {
      //     quadrant: string
      //     width: number
      //     height: number
      //     marginLeft: number
      //     marginTop: number
      //   },
      dragStartWidth: 0,
      isDragHappening: false,
      // Card Editor stuff ---
      currentCard: null as any,
      currentCardType: '',
      cardLookup: [] as any[],
      cardCount: 1,
      showExport: false,
      saveHandle: null as any,
      updateEntry: {} as any,
      xsave: {} as any,
    }
  },

  computed: {
    dashWidthCalculator(): any {
      if (this.$store.state.dashboardWidth && this.$store.state.isFullWidth) {
        return { maxWidth: this.$store.state.dashboardWidth }
      }
      return {}
    },
    wiide(): boolean {
      return this.$store.state.isFullWidth
    },
    fileApi(): HTTPFileSystem {
      return new HTTPFileSystem(this.fileSystemConfig)
    },
  },

  watch: {
    async '$store.state.resizeEvents'() {
      this.resizeAllCards()
    },
    '$store.state.locale'() {
      this.updateThemeAndLabels()
    },
    isFullScreenDashboard() {
      this.config.header.fullscreen = this.isFullScreenDashboard
      this.resizeAllCards()
      this.save()
    },
  },

  methods: {
    save() {},

    async performSave() {
      console.log('---time to save')
      // first let's just try and save it directly. We can this.fileAPI this shit later

      //@ts-ignore
      const showSaveFilePicker = window.showSaveFilePicker
      if (!showSaveFilePicker) {
        console.error('Can only save via Chrome/Edge (for now)')
        return
      }

      if (!this.saveHandle) {
        const dirContents = await this.fileApi.getDirectory(this.xsubfolder)
        const currentDirHandle = dirContents.handles['.']
        const options = {
          startIn: currentDirHandle,
          suggestedName: 'dashboard-1.cfg',
          types: [
            { accept: { 'application/yaml': ['.cfg'] }, description: 'SimWrapper config Files' },
          ],
        }
        const handle = await showSaveFilePicker(options)
        this.saveHandle = handle
      }

      // const contents = YAML.stringify(this.config)
      const contents = this.exportedYaml()

      // Write it via Chrome File System API
      console.log('---writing...')
      const writable = await this.saveHandle.createWritable()
      await writable.write(contents)
      await writable.close()
      console.log('---written.')
    },

    handleEscapeKey(event: any) {
      if (event.key === 'Escape') {
        this.showExport = false
      }
    },

    exportedYaml() {
      const output = {} as any
      //@ts-ignore
      const title = this.$refs['pageTitle']?.innerText || ''
      //@ts-ignore
      const subtitle = this.$refs['pageSubtitle']?.innerText || ''

      output.header = {
        title: title.trim(),
        description: subtitle.trim(),
      }
      if (this.isFullScreenDashboard) output.header.fullscreen = true

      output.layout = {}
      this.rows.forEach((row, i) => {
        const cards = row.cards.map(card => {
          const trimmed = {
            type: card.type,
            title: card.title,
            description: card.description,
            width: card.width,
            ...card.props,
          }
          if (!trimmed.description) delete trimmed.description
          if (!trimmed.width) delete trimmed.width
          return trimmed
        })
        output.layout[`row${i + 1}`] = cards
      })

      // return TOML.stringify(output)
      return YAML.stringify(output)
    },

    copyToClipboard() {
      navigator.clipboard.writeText(this.exportedYaml())
    },

    updateDashboardTitle(event: any) {
      const text = event.target.innerText
      this.title = text.trim()
      this.save()
    },

    updateDashboardSubtitle(event: any) {
      const text = event.target.innerText
      this.description = text.trim()
      this.save()
    },

    deleteCard(card: any) {
      const cardNum = card.number
      console.log('DELETE CARD NUMBER', cardNum)

      // if only one card, don't
      if (this.rows.length == 1 && this.rows[0].cards.length == 1) return

      // remove the card
      this.rows.forEach(row => {
        row.cards = row.cards.filter(card => card.number !== cardNum)
      })
      // remove empty row
      this.rows = this.rows.filter(row => {
        if (!row.cards.length) {
          delete this.config[row.id]
          return false
        }
        return true
      })
      this.fixRowOrderAfterInsertion()
      this.resizeAllCards()
      this.save()
    },

    hideConfigPanel() {
      this.currentCard = false
      this.resizeAllCards()
    },

    async updateEntryDebounced(field: CardField, event: any) {
      const card = this.cardLookup[this.currentCard.number]

      card.props[field.id as any] = event
      card.title = this.currentCard.props.title
      card.errors = []

      this.currentCard = card

      // tell Vue
      const ztype = card.type
      card.type = 'blank'
      await this.$nextTick()
      card.type = ztype
      this.rows = [...this.rows]
      this.save()
    },

    changeCardType(cardType: any) {
      console.log({ cardType })
      this.currentCardType = cardType
      this.currentCard.type = cardType
      this.currentCard.errors = []
      // if (this.currentCard.title.startsWith('Blank card')) {
      this.currentCard.title = this.cardSchemas[cardType].label
      // }
      this.save()
    },

    async editCard(card: any) {
      if (!this.editMode) return

      this.currentCard = card
      this.currentCardType = card.type
      await sleep(250) // let smooth animation finish first
      this.resizeAllCards()
    },

    dragStart(event: DragEvent) {
      if (!this.editMode) return

      this.$emit('isDragging', true)
      this.handleDragStartStop(true)

      const folder = `${this.root}/${this.xsubfolder}`
      const panel = { component: 'TabbedDashboardView', props: {} }
      const root = this.root || folder // might be at root panel
      const correctFolder = this.root ? folder : ''

      const bundle = Object.assign({}, panel, {
        root,
        subfolder: correctFolder,
        xsubfolder: correctFolder,
      }) as any

      bundle.yamlConfig = bundle.config
      delete bundle.config

      const text = JSON.stringify(bundle) as any
      event.dataTransfer?.setData('bundle', text)
    },

    handleDragStartStop(dragState: boolean) {
      this.isDragHappening = dragState
    },

    buildDragHighlightStyle(x: number, y: number) {
      // console.log({ x, y })
      // top row
      if (x == -1) {
        const opacity = this.dragQuadrant == 'rowTop' ? '1' : '0'
        const pointerEvents = this.isDragHappening ? 'auto' : 'none'

        return { top: 0, opacity, pointerEvents, backgroundColor: '#ffcc4480' }
      }

      // bottom row
      if (x == -2) {
        const opacity = this.dragQuadrant == 'rowBottom' ? '1' : '0'
        const pointerEvents = this.isDragHappening ? 'auto' : 'none'
        return { bottom: 0, opacity, pointerEvents, backgroundColor: '#ffcc4480' }
      }

      // tiles
      if (x !== this.dragX || y !== this.dragY || !this.dragQuadrant) return {}

      const backgroundColor = this.dragQuadrant.quadrant == 'center' ? '#00000000' : '#4444dd90'
      const area: any = { opacity: 1.0, backgroundColor }
      Object.entries(this.dragQuadrant).forEach(e => (area[e[0]] = `${e[1]}px`))
      return area
    },

    stillDragging(props: { event: DragEvent; x: number; y: number; row: string }) {
      if (!this.editMode) return

      const { event, x, y, row } = props
      this.isDragHappening = true

      // console.log(222, props)
      // row is special
      if (row) {
        this.dragQuadrant = row
        return
      }

      this.dragX = x
      this.dragY = y

      const ref = this.$refs[`dragContainer${x}-${y}`] as any[]
      const panel = ref[0]

      // console.log(223, ref)

      const pctX = event.layerX / panel.clientWidth
      const pctY = event.layerY / panel.clientHeight

      // console.log({ pctX, pctY })
      let BORDER = 5

      if (pctY < 0.1) {
        this.dragQuadrant = {
          quadrant: 'top',
          width: panel.clientWidth - BORDER * 2,
          height: panel.clientHeight * 0.2,
          marginLeft: BORDER,
          marginTop: BORDER,
        }
      } else if (pctY > 0.8) {
        this.dragQuadrant = {
          quadrant: 'bottom',
          width: panel.clientWidth - BORDER * 2,
          height: panel.clientHeight * 0.2,
          marginLeft: BORDER,
          marginTop: panel.clientHeight * 0.8 - BORDER,
        }
      } else if (pctX < 0.4) {
        this.dragQuadrant = {
          quadrant: 'left',
          width: panel.clientWidth / 2 - BORDER * 2,
          height: panel.clientHeight - BORDER * 2,
          marginLeft: BORDER,
          marginTop: BORDER,
        }
      } else if (pctX > 0.6) {
        this.dragQuadrant = {
          quadrant: 'right',
          width: panel.clientWidth / 2 - BORDER * 2,
          height: panel.clientHeight - BORDER * 2,
          marginLeft: panel.clientWidth / 2 + BORDER,
          marginTop: BORDER,
        }
      } else {
        BORDER *= 5
        const w = (panel.clientWidth - BORDER * 2) * 0.95
        const h = (panel.clientHeight - BORDER * 2) * 0.95
        this.dragQuadrant = {
          quadrant: 'center',
          width: w,
          height: h,
          marginLeft: (panel.clientWidth - w) / 2,
          marginTop: (panel.clientHeight - h) / 2,
        }
      }
      // console.log(225, this.dragQuadrant)
    },

    dragEnd() {
      this.dragQuadrant = null
      this.dragX = -1
      this.dragY = -1

      if (!this.editMode) return

      this.handleDragStartStop(false)
    },

    onDrop(props: { event: DragEvent; x: number; y: number; row: string }) {
      if (!this.editMode) return
      if (!this.dragQuadrant) return
      // console.log(111, props)

      const { event, x, y, row } = props

      // monotonically increasing global for this dashboard:
      // because cards come and go so they need unique numbers
      this.cardCount++

      const card = {
        errors: [],
        isLoaded: false,
        number: this.cardCount,
        id: `card-id=${this.cardCount}`,
        showHeader: true,
        title: '',
        props: {},
        // backgroundColor: `hsl(${(cardNumber * 100) % 360},60%,50%)`,
      }

      this.cardLookup[this.cardCount] = card

      // alright this is complicated because this.config is a PROP
      // and this.rows is built based on its content. But if we just
      // modify this.rows then the etc...
      const rowId = `row${1 + this.rows.length}`
      try {
        switch (this.dragQuadrant.quadrant) {
          case 'top':
            this.rows.splice(y, 0, { id: rowId, cards: [card] })
            this.fixRowOrderAfterInsertion()
            break
          case 'bottom':
            this.rows.splice(y + 1, 0, { id: rowId, cards: [card] })
            this.fixRowOrderAfterInsertion()
            break
          case 'left':
            this.rows[y].cards.splice(x, 0, card)
            break
          case 'right':
            this.rows[y].cards.splice(x + 1, 0, card)
            break
        }
      } catch (e) {
        console.warn(e)
      }

      this.dragEnd()
      this.resizeAllCards()
      this.save()
    },

    /**
     * After inserting a row, we also need to update this.config since it is an object containing
     * the same things. This was probably a dumb design, but here we are.
     * So now we want to get the keys in the same order as the array, WITHOUT
     * creating a new object. Yay Vue!
     */
    fixRowOrderAfterInsertion() {
      for (const key of Object.keys(this.config.layout)) delete this.config.layout[key]
      this.rows.forEach((row, i) => {
        this.config.layout[`row${i}`] = row.cards //
      })
    },

    /**
     * This only gets triggered when a topsheet has some titles.
     * Remove the dashboard titles and use the ones from the topsheet.
     */
    setCardTitles(card: any, event: any) {
      card.title = event
      card.description = ''
    },

    setCardError(card: any, event: any) {
      // blank event: clear all errors for this card
      if (!event) {
        card.errors = []
        return
      }

      if (typeof event === 'string' && event) {
        // simple string error message
        card.errors.push(event)
      } else if (event.msg && event.type === Status.ERROR) {
        // status object: ignore warnings for now
        card.errors.push(event.msg)
      }
    },

    async resizeAllCards() {
      // must wait for Vue tick or doesn't work
      await this.$nextTick()

      this.isResizing = true
      for (const row of this.rows) {
        for (const card of row.cards) {
          this.updateDimensions(card.id)
        }
      }
      this.isResizing = false
    },

    handleToggleInfoClick(card: any) {
      this.infoToggle[card.id] = !this.infoToggle[card.id]
    },

    async getFiles() {
      const folderContents = await this.fileApi.getDirectory(this.xsubfolder)

      // hide dot folders
      const files = folderContents.files.filter(f => !f.startsWith('.')).sort()
      return files
    },

    getCardComponent(card: { type: string; title: string }) {
      // console.log(1, card)
      if (card.type === 'table' || card.type === 'topsheet') return 'TopSheet'

      // load the plugin
      if (panelLookup[card.type]) {
        return panelLookup[card.type]
      }

      // might be a chart
      if (chartTypes.indexOf(card.type) > -1) return 'card-' + card.type

      // or might be a vue component? TODO check matrix viewer
      card.title = card.type ? `Unknown panel type "${card.type}"` : `Blank panel`
      return undefined // card.type
    },

    setDimensionResizer(options: { id: string; resizer: any }) {
      this.resizers[options.id] = options.resizer
      this.updateDimensions(options.id)
    },

    async toggleZoom(card: any) {
      if (this.fullScreenCardId) {
        this.fullScreenCardId = ''
      } else {
        this.fullScreenCardId = card.id
      }
      this.$emit('zoom', this.fullScreenCardId)
      // allow vue to resize everything
      await this.$nextTick()
      // tell plotly to resize everything
      this.updateDimensions(card.id)
    },

    updateDimensions(cardId: string) {
      const element = document.getElementById(cardId)

      if (element) {
        const dimensions = { width: element.clientWidth, height: element.clientHeight }
        if (this.resizers[cardId]) this.resizers[cardId](dimensions)
      }
      if (!this.isResizing) globalStore.commit('resize')
    },

    getCardStyle(card: any) {
      // figure out height. If card has registered a resizer with changeDimensions(),
      // then it needs a default height (300)

      // markdown does not want a default height
      const defaultHeight = card.type === 'text' ? undefined : 300

      // old version:  plotlyChartTypes[card.type] ? 300 : undefined

      const height = card.height ? card.height * 60 : defaultHeight
      const flex = card.width || 1

      let style: any = { flex: flex }

      if (card.backgroundColor || card.background) {
        style.backgroundColor = card.backgroundColor || card.background
      }

      if (this.editMode) {
        if (card.number == this.currentCard?.number) {
          style.border = '5px solid #10a050'
          style.opacity = 1.0
        } else {
          style.border = '5px solid #00000000'
          style.opacity = 0.7
          // style.filter = 'blur(1px)'
        }
        if (!this.currentCard) {
          style.opacity = 1.0
          style.filter = ''
        }
      }

      if (height && !this.isFullScreenDashboard) {
        style.minHeight = `${height}px`
      }

      if (this.fullScreenCardId) {
        if (this.fullScreenCardId !== card.id) {
          style.display = 'none'
        } else {
          style = {
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            margin: '6px 0px', // '18px 1rem 0.5rem 1rem',
          }
        }
      }

      return style
    },

    getFileSystem(name: string): FileSystemConfig {
      const svnProject: FileSystemConfig[] = this.$store.state.svnProjects.filter(
        (a: FileSystemConfig) => a.slug === name
      )
      if (svnProject.length === 0) throw Error('no such project')
      return svnProject[0]
    },

    getTabTitle(index: number) {
      let title = `Tab ${index + 1}`
      let tab = this.subtabs[index]

      if (this.$store.state.locale === 'de') {
        title = tab.subtab_de || tab.subtab || tab.subtab_en
      } else {
        title = tab.subtab_en || tab.subtab || tab.subtab_de
      }
      return title
    },

    async switchTab(index: number) {
      if (index === this.activeTab) return

      // Force teardown the dashboard to ensure we start with a clean slate
      this.dashboardTabWithDelay = -1
      this.showFooter = false

      await this.$nextTick()

      this.activeTab = index
      this.rows = [] // yyy
      this.rowFlexWeights = []

      // to give browser time to teardown: 0.2 seconds delay
      setTimeout(() => {
        this.dashboardTabWithDelay = index
        const { subtab, ...queryWithoutSubtab } = this.$route.query
        if (index) {
          this.$router.replace({
            query: Object.assign({}, queryWithoutSubtab, { subtab: `${index + 1}` }),
          })
        } else {
          this.$router.replace({ query: {} })
        }
        this.selectTabLayout()
      }, 200)
    },

    async setupDashboard() {
      // Do we have config already or do we need to fetch it from the yaml file?
      if (this.config) {
        this.yaml = this.config
      } else if (this.gist) {
        this.yaml = this.gist
      } else {
        const yaml = await this.fileApi.getFileText(`${this.xsubfolder}/dashboard.yaml`)
        this.yaml = YAML.parse(yaml)
      }

      // set header
      this.updateThemeAndLabels()

      // if there are subtabs, prepare them
      if (this.yaml.subtabs) this.subtabs = await this.setupSubtabs()

      this.setFullScreen()

      // // Start on correct subtab
      if (this.$route.query.subtab) {
        try {
          const userSupplied = parseInt('' + this.$route.query.subtab) - 1
          this.activeTab = userSupplied || 0
        } catch (e) {
          // user spam; just use first tab
          this.activeTab = 0
        }
      } else {
        this.activeTab = 0
      }

      this.dashboardTabWithDelay = this.activeTab
      this.selectTabLayout()
    },

    async setupSubtabs() {
      // YAML definition of subtabs can be:
      // 1) false/missing: no subtabs.
      // 2) true: convert each row property of the layout to a subtab
      // 3) array of dashboard*.yaml filenames: each subtab will contain the
      //     imported dashboard contents
      // 4) array[] of row IDs that comprise each subtab, so you can combine rows as you wish
      //
      //    subtabs:
      //    - title: 'Tab1'
      //      rows: ['modeshare','statistics']
      //
      // this.subtabs will then hold an array with the title and layout object for each subtab.

      let i = 1
      const subtabs = [] as any

      // "TRUE": convert each layout row to a subtab ------------------
      if (this.yaml.subtabs === true) {
        // One subtab per layout object.
        const allRowKeys = new Set(Object.keys(this.yaml.layout))
        for (const rowKey of allRowKeys) {
          subtabs.push({ title: rowKey, layout: this.yaml.layout[rowKey] })
        }
        return subtabs
      }

      // Not an array? Fail. -----------------------------------------------------
      if (!Array.isArray(this.yaml.subtabs)) {
        console.warn('SUBTABS: Not an array', this.yaml.subtabs)
        return []
      }

      // "Array of filepaths": load each dashboard as a subtab --------------
      if (typeof this.yaml.subtabs[0] == 'string') {
        this.yaml.layout = []
        for (const filename of this.yaml.subtabs) {
          // get full path to the dashboard file
          const fullpath = `${this.xsubfolder}/${filename}`
          // also get the working directory of that dashboard file
          const subtabWorkingDirectory = fullpath.substring(0, fullpath.lastIndexOf('/'))

          try {
            const raw = await this.fileApi.getFileText(fullpath)
            const dashContent = YAML.parse(raw)
            const subtab = {
              title: dashContent.header.tab || dashContent.header.title || filename,
              description: dashContent.description,
              layout: dashContent.layout,
              subtabFolder: subtabWorkingDirectory,
            } as any
            subtabs.push(subtab)
          } catch (e) {
            console.error('' + e)
          }
        }
        return subtabs
      }

      // "Array of Objects": Each element is a layout object ------------
      const allRowKeys = new Set(Object.keys(this.yaml.layout))
      for (const tab of this.yaml.subtabs) {
        subtabs.push({
          title: this.getObjectLabel(tab, 'title'),
          layout: tab.rows.map((rowName: string) => {
            allRowKeys.delete(rowName)
            return this.yaml.layout[rowName]
          }),
        })
      }
      for (const leftoverKey of allRowKeys) {
        // if user missed any rows, add them at the end
        subtabs.push({ title: leftoverKey, layout: this.yaml.layout[leftoverKey] })
      }

      return subtabs
    },

    selectTabLayout() {
      // Choose subtab or full layout

      if (this.subtabs.length && this.activeTab > -1) {
        const subtab = this.subtabs[this.activeTab]
        this.setupRows(subtab.layout, subtab.subtabFolder)
      } else if (this.yaml.layout) {
        this.setupRows(this.yaml.layout)
      } else {
        this.$store.commit(
          'error',
          `Dashboard YAML: could not find current subtab ${this.activeTab}`
        )
      }
    },

    setupRows(layout: any, subtabFolder?: string) {
      for (const rowId of Object.keys(layout)) {
        let cards: any[] = layout[rowId]

        // row must be an array - if it isn't, assume it is an array of length one
        if (!cards.forEach) cards = [cards]

        let flexWeight = 1

        cards.forEach(card => {
          this.cardCount++
          const numCard = this.cardCount
          card.id = `card-id-${numCard}`
          card.isLoaded = false
          card.number = numCard
          this.cardLookup[numCard] = card

          // hoist flex weight if card has "height" and we are full-screen
          try {
            if (this.isFullScreenDashboard && card.height) {
              flexWeight = Math.max(flexWeight, card.height)
            }
          } catch (e) {
            console.error('' + e)
            this.$emit('error', 'Dashboard YAML: non-numeric height')
            flexWeight = 1
          }

          // make YAML easier to write: merge "props" property with other properties
          // so user doesn't need to specify "props: {...}"
          if (!card.props) card.props = Object.assign({}, card)
          // markdown plugin really wants to know the height
          if (card.height !== undefined) card.props.height = card.height

          // Vue 2 is weird about new properties: use Vue.set() instead
          Vue.set(this.opacity, card.id, 0.5)
          Vue.set(this.infoToggle, card.id, false)
          Vue.set(card, 'errors', [] as string[])

          // Card header could be hidden
          if (!card.title && !card.description) card.showHeader = false
          else card.showHeader = true
        })

        this.rows.push({ id: rowId, cards, subtabFolder })
        this.rowFlexWeights.push(flexWeight)
      }
      this.resizeAllCards()
      this.$emit('layoutComplete')
    },

    updateThemeAndLabels() {
      this.title = this.getDashboardLabel('title')
      this.description = this.getDashboardLabel('description')

      if (this.yaml.header.theme) {
        this.$store.commit('setTheme', this.yaml.header.theme)
      }
    },

    getObjectLabel(o: any, prefix: string) {
      let label = prefix

      if (this.$store.state.locale === 'de') {
        label = o[`${prefix}_de`] || o[`${prefix}`] || o[`${prefix}_en`] || ''
      } else {
        label = o[`${prefix}_en`] || o[`${prefix}`] || o[`${prefix}_de`] || ''
      }

      return label
    },

    getDashboardLabel(element: 'title' | 'description') {
      const header = this.yaml.header
      let tag = '...'

      if (this.$store.state.locale === 'de') {
        tag = header[`${element}_de`] || header[`${element}`] || header[`${element}_en`] || ''
      } else {
        tag = header[`${element}_en`] || header[`${element}`] || header[`${element}_de`] || ''
      }

      return tag
    },

    async handleCardIsLoaded(card: any) {
      card.isLoaded = true
      this.opacity[card.id] = 1.0
      this.numberOfShownCards++
    },

    setupNarrowPanelObserver() {
      const dashboard = document.getElementById(this.viewId) as HTMLElement
      this.narrowPanelObserver = new ResizeObserver(this.handleResize)
      this.narrowPanelObserver.observe(dashboard)
    },

    handleResize() {
      const dashboard = document.getElementById(this.viewId) as HTMLElement
      if (dashboard) this.isPanelNarrow = dashboard.clientWidth < 800
      this.setFullScreen()
      this.$store.commit('resize')
    },

    setFullScreen() {
      if (this.isPanelNarrow) {
        // Narrow panels are never fullscreen
        this.isFullScreenDashboard = false
      } else {
        // help user with capitalization
        this.isFullScreenDashboard =
          this.yaml.header.fullScreen ||
          this.yaml.header.fillScreen ||
          this.yaml.header.fullscreen ||
          this.yaml.header.fillscreen
      }
    },

    getRowClass(row: any) {
      const rowClass = {
        'is-panel-narrow': this.isPanelNarrow,
        'is-fullscreen-dashboard': this.isFullScreenDashboard,
      } as any
      rowClass[`row-${row.id}`] = true
      return rowClass
    },
  },
  async mounted() {
    window.addEventListener('resize', this.resizeAllCards)
    window.addEventListener('keydown', this.handleEscapeKey)

    this.setupNarrowPanelObserver()

    this.updateEntry = debounce(this.updateEntryDebounced, 200)
    // this.save = debounce(this.performSave, 500)

    if (this.gist) {
      this.fileSystemConfig = {
        name: 'gist',
        slug: 'gist',
        description: 'From GitHub',
        baseURL: this.gist.config.baseUrl,
      }
    } else {
      this.fileSystemConfig = this.getFileSystem(this.root)
    }

    this.fileList = await this.getFiles()

    try {
      await this.setupDashboard()
      await this.resizeAllCards()
    } catch (e) {
      console.error('oh nooo' + e)
      this.$emit('error', 'Error setting up dashboard, check YAML?')
    }
  },
  beforeDestroy() {
    this.resizers = {}
    this.narrowPanelObserver?.disconnect()
    window.removeEventListener('resize', this.resizeAllCards)
    window.removeEventListener('keydown', this.handleEscapeKey)
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.dashboard {
  margin: 0 0;
  padding: 0 0;
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  overflow-x: hidden;

  .dashboard-content {
    max-width: $dashboardWidth;
    margin: 0 auto 0 auto;
    position: relative;
  }

  .dashboard-content.wiide {
    max-width: unset;
  }
}

.dashboard-header {
  margin: 1rem 1rem 0.5rem 0rem;

  h2 {
    line-height: 2.1rem;
    padding-bottom: 0.5rem;
    margin-right: 1rem;
  }

  p {
    line-height: 1.4rem;
    margin-right: 1rem;
  }

  h2.is-editable:hover,
  h2.is-editable:active,
  p.is-editable.xsubtitle:hover,
  p.is-editable.xsubtitle:active {
    background-color: var(--bgPanel2);
    border-radius: 4px;
  }
}

.dash-row {
  display: flex;
  flex-direction: row;
}

// FULL-SCREEN-DASHBOARD

.dashboard.is-fullscreen-dashboard {
  display: flex;
  flex-direction: column;
}

.dashboard .dashboard-content.is-fullscreen-dashboard {
  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
}

.dash-row.is-fullscreen-dashboard {
  flex: 1;
}

// --end--

.dash-card-frame {
  position: relative;
  display: grid;
  grid-auto-columns: 1fr;
  grid-auto-rows: auto auto 1fr;
  margin: 0 $cardSpacing $cardSpacing 0;
  background-color: var(--bgCardFrame);
  padding: 2px 3px 3px 3px;
  border-radius: 4px;
  overflow-x: auto;

  .dash-card-headers {
    display: flex;
    flex-direction: row;
    line-height: 1.2rem;
    padding: 3px 3px 2px 3px;
    p {
      margin-bottom: 0.1rem;
    }
  }

  .dash-card-headers.fullscreen {
    padding-top: 0;
  }

  .dash-card-headers.is-editing:hover {
    background-color: #1066e738;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.2s ease;
  }

  .header-buttons {
    display: flex;
    flex-direction: row;
    margin-left: auto;

    button {
      background-color: #00000000;
      color: var(--link);
      opacity: 0.5;
    }
    button:hover {
      background-color: #ffffff20;
      opacity: 1;
    }
  }

  h3 {
    grid-row: 1 / 2;
    font-size: 1.1rem;
    line-height: 1.5rem;
    // margin-bottom: 0.5rem;
    color: var(--link);
  }

  // if there is a description, fix the margins
  p {
    grid-row: 2 / 3;
    margin-top: -0.5rem;
    margin-bottom: 0.5rem;
  }

  .spinner-box {
    grid-row: 3 / 4;
    position: relative;
    background: url('../assets/simwrapper-logo/SW_logo_icon_anim.gif');
    background-size: 8rem;
    background-repeat: no-repeat;
    background-position: center center;
  }

  .spinner-box.is-loaded {
    background: none;
  }
}

// .dash-card-frame.wiide {
//   // margin-right: 2rem;
// }

.dash-card {
  transition: opacity 0.5s, border-color 0.5s ease;
  overflow-x: hidden;
  overflow-y: hidden;
  border-radius: 2px;
}

// Observe for narrowness instead of a media-query
// since the panel might be narrow even if the window is wide.
// .dashboard.is-panel-narrow {
//   // padding: 0rem 0rem;
// }

.dashboard-header.is-panel-narrow {
  margin: 1rem 1rem 1rem 0rem;
}

.dash-row.is-panel-narrow {
  flex-direction: column;
}

.dash-card-frame.is-panel-narrow {
  margin: 0rem 0.5rem 1rem 0;
}

ul.tab-row {
  padding: 0 0;
  margin: 0 0;
  border-bottom: none;
}

li.tab-entry b a {
  color: var(--link);
  padding-bottom: 2px;
}

li.is-active b a {
  border-bottom: 2px solid var(--link);
}

li.is-not-active b a {
  color: var(--text);
}

.error-text {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: var(--bgError);
  color: #800;
  border: 1px solid var(--bgCream4);
  border-radius: 3px;
  margin-bottom: 0px;
  padding: 0.5rem 0.5rem;
  z-index: 25000;
  font-size: 0.9rem;
  font-weight: 500;
  max-height: 50%;
  overflow-y: auto;
  p {
    line-height: 1.2rem;
    margin: 0 0;
  }
}

.clear-error {
  float: right;
  font-weight: bold;
  margin-right: 2px;
  padding: 0px 5px;
}

.clear-error:hover {
  cursor: pointer;
  background-color: #88888833;
}

.drag-highlight {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  margin-left: 0px;
  margin-top: 0px;
  width: 100%;
  height: 100%;
  grid-row: 1 / 2;
  grid-column: 1 / 2;
  opacity: 0;
  z-index: 10000;
  border: 8px solid #00000000;
  transition: background-color 0.2s, opacity 0.2s, height 0.2s, width 0.2s, margin-top 0.2s,
    margin-left 0.2s;
  transition-timing-function: ease-in;
  pointer-events: none;
}

.edit-panel {
  overflow-y: auto;
  margin: 5.5rem -2px 17px 0;
  padding: 0.5rem;
  background-color: var(--bgPanel2);
  width: 18rem;
  border: 1px solid #80808080;
  display: flex;
  flex-direction: column;
  animation: slideIn 0.25s ease-out;
  font-size: 0.9rem;
  border-radius: 6px 0 0 6px;

  h4 {
    color: var(--textBold);
  }
}

@keyframes slideIn {
  0% {
    opacity: 0;
    margin-left: -18rem;
    transform: translateX(100%);
  }
  100% {
    opacity: 1;
    margin-left: 0rem;
    transform: translateX(0);
  }
}

.entry-label {
  margin: 1rem 0 2px 1px;
  font-weight: bold;
  color: var(--link);
}

.entry-hint {
  padding: 0.25rem 2px 0 2px;
  line-height: 1.1rem;
}

.entry-checkbox {
  font-weight: bold;
  margin-top: 1.5rem;
  color: var(--link);
}

.drag-tile {
  border: 3px dotted $matsimBlue;
  border-radius: 6px;
  padding: 4px 10px 5px 10px;
  cursor: grab;
}
.drag-tile:hover {
  border: 3px dashed $matsimBlue;
}

.editable {
  user-select: none;
  margin: auto 3px 0 0;
  gap: 0.75rem;
}

.export-modal {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #000000cc;
  z-index: 50000;
  display: flex;
}

.export-panel {
  z-index: 50005;
  background-color: var(--bgPanel);
  color: var(--textBold);
  padding: 1rem;
  filter: $filterShadow;
  border-radius: 4px;
  min-width: 35rem;
  max-width: 60rem;
  margin: 5rem auto auto auto;

  .export-content {
    position: relative;
    display: flex;
    flex-direction: column;
    max-height: 20rem;
    overflow-y: auto;
    user-select: text;
    margin-top: 2px;

    pre {
      background-color: var(--bgDashboard) !important;
      color: var(--text);
    }

    p {
      color: var(--link);
      position: absolute;
      top: 0;
      right: 0;
      font-weight: 500;
      margin: 2px 18px 0 0;
      cursor: pointer;
      padding: 0 2px;
      border-radius: 4px;
      user-select: none;
    }
    p:hover {
      background-color: #80808040;
    }
    p:active {
      background-color: var(--bgBold);
    }
  }
}

.fa-times:hover {
  color: #c00;
  cursor: pointer;
}

.zeep {
  font-family: Outfit !important;
  font-weight: 300;
  color: var(--text) !important;
  padding: 0 0.75rem;
}
</style>

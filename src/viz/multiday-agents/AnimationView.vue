<template lang="pug">
#anim-container

</template>

<script lang="ts">
import { Component, Vue, Watch, Prop } from 'vue-property-decorator'
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import ZipLoader from 'zip-loader'
import * as THREE from 'three'

import store from '@/store'
import { Agent, ColorScheme, ColorSet, Infection, Health, DARK_MODE, LIGHT_MODE } from '@/Globals'
import AgentGeometry from './AgentGeometry'
import EventBus from '@/EventBus.vue'

@Component
export default class AnimationView extends Vue {
  @Prop({ required: true }) private speed!: number

  @Prop({ required: true }) private day!: number

  @Prop({ required: true }) private showSusceptible!: boolean

  private timeFactor = 600.0

  private timeDirection = 1

  private vertexShader = require('./shaderVert.vert').default

  private fragmentShader = require('./shaderFrag.frag').default

  private networkFilename = 'network.zip'

  private state = store.state

  private colors = this.state.colorScheme == ColorScheme.DarkMode ? DARK_MODE : LIGHT_MODE

  // keep track of time - current time in the simulation itself
  private simulationTime = 0

  // Count the seconds since the clock started running;
  // Every pause resets the anim clock to zero!
  private animationTimeSinceUnpaused = 0
  private clock = new THREE.Clock(false) // do not autostart clock!

  // when to next update the visible clock
  private nextClockUpdateTime = 0

  private scene = new THREE.Scene()
  private renderer = new THREE.WebGLRenderer({ antialias: true })
  private camera?: THREE.PerspectiveCamera

  private OrbitControl = require('@/util/OrbitControl')

  // eslint-disable-next-line
  private container: any

  // eslint-disable-next-line
  private cameraControls: any

  private linkMaterial = new THREE.LineBasicMaterial({ color: this.colors.links })

  private xRange = [1e25, -1e25]
  private yRange = [1e25, -1e25]

  // berlin
  private midpointX = 4595000
  private midpointY = 5820000

  private tripList: { [id: string]: Agent } = {}
  private infectionList: { [id: string]: Infection } = {}

  private allTripsHaveBegun = false

  private publicPath = '/'

  @Watch('speed') speedChanged() {
    this.$store.commit('setSimulation', true)

    const newDirection = this.speed < 0 ? -1 : 1
    if (newDirection === this.timeDirection) return

    // switch everything backwards
    this.clock.stop()
    this.clock = new THREE.Clock(false)

    this.timeDirection = newDirection

    this.clock.start()
    this.animationTimeSinceUnpaused = 0
    requestAnimationFrame(this.moveCameraWhilePaused)
    console.log('done flip')
  }

  @Watch('state.isRunning')
  private playPauseSim() {
    if (this.state.isRunning) {
      // pressed play.
      this.clock.start()
      requestAnimationFrame(this.animate)
    } else {
      // pressed pause
      this.clock.stop()
      this.clock = new THREE.Clock(false)

      // Reset animation frame-clock to zero
      this.animationTimeSinceUnpaused = 0
      requestAnimationFrame(this.moveCameraWhilePaused)
    }
  }

  @Watch('state.colorScheme')
  private switchColorScheme(scheme: ColorScheme) {
    this.colors = scheme == ColorScheme.LightMode ? LIGHT_MODE : DARK_MODE

    // background
    this.scene.background = new THREE.Color(this.colors.background)

    // agents
    if (this.agentMaterial) {
      this.agentMaterial.uniforms['cSusceptible'].value = new THREE.Color(this.colors.susceptible)
      this.agentMaterial.uniforms['cInfectedButNotContagious'].value = new THREE.Color(
        this.colors.infectedButNotContagious
      )
      this.agentMaterial.uniforms['cContagious'].value = new THREE.Color(this.colors.contagious)
      this.agentMaterial.uniforms['cSymptomatic'].value = new THREE.Color(this.colors.symptomatic)
      this.agentMaterial.uniforms['cSeriouslyIll'].value = new THREE.Color(this.colors.seriouslyIll)
      this.agentMaterial.uniforms['cCritical'].value = new THREE.Color(this.colors.critical)
      this.agentMaterial.uniforms['cRecovered'].value = new THREE.Color(this.colors.recovered)
    }

    // road network
    // rebuild the streets
    const net = this.scene.getObjectByName('network')
    if (net) this.scene.remove(net)

    this.linkMaterial.dispose()
    this.linkMaterial = new THREE.LineBasicMaterial({ color: this.colors.links })

    for (const networkLayer of this.networkLayers) {
      const name = networkLayer.name
      const mesh = this.scene.getObjectByName(name)
      if (mesh) this.scene.remove(mesh)

      const newLayer = new THREE.LineSegments(networkLayer.geometry, this.linkMaterial)
      newLayer.name = name
      this.scene.add(newLayer)
    }
  }

  @Watch('day') async dayChanged() {
    console.log('------------------ DAY', this.day)

    // pause the clock
    this.clock.stop()
    this.animationTimeSinceUnpaused = 0
    this.clock = new THREE.Clock(false)

    this.updateAgentAttributesForDay(this.day)

    // and let er go again
    // this.clock.start()

    // requestAnimationFrame(this.animate)
    // ^^^^ this was a bug! added an extra animate() call per frame, every
    // time user switched days.  Compounded misery!
  }

  private mounted() {
    this.setInitialClockTime()
    this.setupSimulation()
    this.setupDragListener()

    window.addEventListener('resize', this.onWindowResize, false)
    document.addEventListener('visibilitychange', this.handleVisibilityChange, false)
  }

  private setInitialClockTime() {
    // set specified time, if we got one
    const secondsParam = '' + this.$route.query.start
    if (secondsParam && parseInt(secondsParam) != NaN) {
      const seconds = parseInt(secondsParam)
      if (seconds >= 0 || seconds < 86400) {
        this.simulationTime = seconds
        this.setVisibleClock()
        this.$nextTick()
      }
    }
  }

  @Watch('showSusceptible') toggleSusceptible() {
    if (!this.agentGeometry) return
    if (!this.agentMaterial) return

    const show = this.showSusceptible ? 1.0 : 0.0
    this.agentMaterial.uniforms['showSusceptible'].value = show
    this.agentMaterial.uniformsNeedUpdate = true
  }

  private handleVisibilityChange() {
    console.log('window visibility changed!! hidden:', document.hidden)
    this.$store.commit('setSimulation', document.hidden ? false : true)
  }

  private wasSimulationRunning = true

  private setupDragListener() {
    const parent = this
    EventBus.$on(EventBus.DRAG, function(seconds: number) {
      if (seconds === -1) {
        // start drag
        parent.wasSimulationRunning = parent.state.isRunning
        parent.$store.commit('setSimulation', false)
      } else if (seconds === -2) {
        // end drag
        parent.$store.commit('setSimulation', parent.wasSimulationRunning)
      } else {
        // dragging
        parent.simulationTime = parent.nextClockUpdateTime = seconds
        parent.animate()
      }
    })
  }

  private exitSimulation() {
    this.clock = new THREE.Clock(false)
    this.simulationTime = 0
    this.nextClockUpdateTime = 0
    this.timeDirection = 1

    while (this.scene.children.length) {
      this.scene.remove(this.scene.children[0])
    }
  }

  private beforeDestroy() {
    // reset the sim to zero
    this.exitSimulation()

    window.removeEventListener('resize', this.onWindowResize)
    document.removeEventListener('visibilityChange', this.handleVisibilityChange)
    EventBus.$off(EventBus.DRAG)

    // Some types of THREE objects must be manually destroyed
    // https://threejs.org/docs/index.html#manual/en/introduction/How-to-dispose-of-objects
    if (this.agentMaterial) this.agentMaterial.dispose()
    if (this.agentGeometry) this.agentGeometry.dispose()

    for (const networkLayer of this.networkLayers) {
      networkLayer.geometry.dispose()
    }

    this.linkMaterial.dispose()
    this.scene.dispose()
  }

  private onWindowResize() {
    this.container = document.getElementById('anim-container')
    if (!this.container || !this.camera) return

    const canvas = this.renderer.domElement

    this.camera.aspect = this.container.clientWidth / this.container.clientHeight
    this.camera.updateProjectionMatrix()

    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight)
  }

  private async setupSimulation() {
    this.initScene()

    this.$store.commit('setStatusMessage', 'loading agents')

    await this.loadTrips()

    // this can happen in the background
    this.addNetworkToScene()
  }

  private startSimulation() {
    // let UI know we're about to begin!
    this.$emit('loaded', true)

    if (!this.state.isShowingHelp) {
      this.clock.start()
      this.animate()
      this.$store.commit('setSimulation', true)
    }
  }

  private networkLayers: THREE.LineSegments[] = []

  private async networkLayerAdder(nodes: any[], netlinks: any[], index: number) {
    const batchSize = 20000

    if (index > netlinks.length) {
      this.$store.commit('setStatusMessage', '')
      this.startSimulation()
      return
    }

    const links: THREE.BufferGeometry[] = []
    const start = index
    const end = index + batchSize > netlinks.length ? netlinks.length : index + batchSize

    for (let i = start; i < end; i++) {
      const link = netlinks[i]
      const from = new THREE.Vector3(nodes[link.from_node].x, nodes[link.from_node].y, 0)
      const to = new THREE.Vector3(nodes[link.to_node].x, nodes[link.to_node].y, 0)
      const segment = new THREE.BufferGeometry().setFromPoints([from, to])

      links.push(segment)
    }

    const mergedLines = BufferGeometryUtils.mergeBufferGeometries(links)
    const networkMesh = new THREE.LineSegments(mergedLines, this.linkMaterial)

    networkMesh.name = 'network' + index

    this.scene.add(networkMesh)
    if (this.camera) this.renderer.render(this.scene, this.camera)

    this.networkLayers.push(networkMesh)
    mergedLines.dispose()

    // start the next batch. 1ms timeout required so UI doesn't freeze
    const nextIndex = index + batchSize
    setTimeout(() => {
      this.networkLayerAdder(nodes, netlinks, nextIndex)
    }, 1)
  }

  private async addNetworkToScene() {
    console.log('loading network', this.networkFilename)
    this.networkLayers = []

    // load zipfile
    const zipLoader = new ZipLoader(this.publicPath + this.networkFilename)
    await zipLoader.load()

    // extract json
    const network = zipLoader.extractAsJSON('network.json')

    // eslint-disable-next-line
    const nodes: any = {}
    for (const node of network.nodes) {
      nodes[node.node_id] = { x: node.x - this.midpointX, y: node.y - this.midpointY }
    }

    console.log('network has links:', network.links.length)

    this.networkLayerAdder(nodes, network.links, 0)
    // this.startSimulation()
  }

  private async loadTrips() {
    console.log('loading agent trips')

    const zpath = this.publicPath + 'v3-anim/trips.json'

    console.log(zpath)

    const response = await fetch(zpath)
    if (!response.body) return

    this.tripList = {}
    const body = await response.text()

    for (const ndjson of body.split('\n')) {
      if (!!ndjson) {
        const agent: Agent = JSON.parse(ndjson)
        this.tripList[agent.id] = agent
      }
    }
    console.log('--Done reading trips.')
    this.finishedLoadingTrips()
  }

  private async updateAgentAttributesForDay(day: number) {
    console.log('loading infections for day', day)

    const dayString = ('00' + this.day).slice(-3)
    const zpath = this.publicPath + 'v3-anim/' + dayString + '-infections.json'

    console.log(zpath)
    // we're going to do this async and streamy!
    const response = await fetch(zpath)
    if (!response.body) return

    this.tempStreamBuffer = ''
    this.infectionList = {}

    const decoder = new TextDecoder('utf-8')
    const reader = response.body.getReader()

    // no need to await - will run in background
    this.loopInfectionReader(reader, decoder)
  }

  private loopInfectionReader(reader: ReadableStreamDefaultReader, decoder: TextDecoder) {
    reader.read().then(({ value, done }) => {
      if (done) {
        if (this.tempStreamBuffer) this.processNewlyReadInfection(this.tempStreamBuffer)
        console.log('--Done reading infections.')
        this.finishedLoadingInfections()
      } else {
        this.processNDJSONInfectionChunk(value, decoder)

        // go back for another chunk
        this.loopInfectionReader(reader, decoder)
      }
    })
  }

  private processNewlyReadInfection(ndjson: string) {
    const inf: Infection = JSON.parse(ndjson)
    // I THINK we don't need this?
    // if (inf.path.length === 0) return

    this.infectionList[inf.id] = inf
  }

  private tempStreamBuffer = ''

  private processNDJSONInfectionChunk(
    value: Uint8Array,
    decoder: TextDecoder,
    splitOn: string = '\n'
  ) {
    const chunk = decoder.decode(value)
    this.tempStreamBuffer += chunk
    const parts = this.tempStreamBuffer.split(splitOn)

    parts.slice(0, -1).forEach(ndjson => {
      this.processNewlyReadInfection(ndjson)
    })
    this.tempStreamBuffer = parts[parts.length - 1]
  }

  private agentMaterial?: THREE.ShaderMaterial
  private agentGeometry?: AgentGeometry

  private finishedLoadingInfections() {
    if (!this.agentGeometry) return

    this.agentGeometry.updateInfections(this.infectionList)
    this.clock.start()
  }

  private finishedLoadingTrips() {
    if (this.agentGeometry) this.agentGeometry.dispose()
    this.agentGeometry = new AgentGeometry(this.tripList, this.midpointX, this.midpointY)

    // maybe we already loaded a new day
    if (Object.keys(this.infectionList).length > 0) {
      this.agentGeometry.updateInfections(this.infectionList)
    }

    if (!this.agentMaterial)
      this.agentMaterial = new THREE.ShaderMaterial({
        uniforms: {
          simulationTime: { value: 0.0 },
          showSusceptible: { value: this.showSusceptible },
          colorLinks: { value: new THREE.Color(this.colors.links) },

          cSusceptible: { value: new THREE.Color(this.colors.susceptible) },
          cContagious: { value: new THREE.Color(this.colors.contagious) },
          cInfectedButNotContagious: {
            value: new THREE.Color(this.colors.infectedButNotContagious),
          },
          cSymptomatic: {
            value: new THREE.Color(this.colors.symptomatic),
          },
          cSeriouslyIll: {
            value: new THREE.Color(this.colors.seriouslyIll),
          },
          cCritical: {
            value: new THREE.Color(this.colors.critical),
          },
          cRecovered: {
            value: new THREE.Color(this.colors.recovered),
          },
        },
        vertexShader: this.vertexShader,
        fragmentShader: this.fragmentShader,
        blending: THREE.NoBlending,
        depthTest: true,
        transparent: true,
      })

    const points = new THREE.Points(this.agentGeometry, this.agentMaterial)
    points.name = 'agents'

    // zap the old points, if we have them
    const agentLayer = this.scene.getObjectByName('agents')
    if (agentLayer) this.scene.remove(agentLayer)
    this.scene.add(points)

    if (this.camera) this.renderer.render(this.scene, this.camera)
    this.$store.commit('setStatusMessage', 'loading network')

    console.log('added points')
  }

  private initScene() {
    console.log('hereee 5-----')

    this.container = document.getElementById('anim-container')
    if (!this.container) return

    console.log('hereee 0-----')
    this.scene.background = new THREE.Color(this.colors.background)

    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight)
    this.container.appendChild(this.renderer.domElement)

    const near = 1
    const far = 100000

    this.camera = new THREE.PerspectiveCamera(
      170,
      this.container.clientWidth / this.container.clientHeight,
      near,
      far
    )
    this.cameraControls = new this.OrbitControl.MapControls(this.camera, this.renderer.domElement)
    this.cameraControls.enablePan = true
    this.cameraControls.screenSpacePanning = true
    this.cameraControls.enableZoom = true
    this.cameraControls.enableRotate = false

    this.camera.position.set(0, 0, 1500)
    this.camera.lookAt(0, 0, -1)

    this.cameraControls.update()

    this.renderer.render(this.scene, this.camera)

    console.log('--init complete!')
  }

  private moveCameraWhilePaused() {
    if (!this.camera) return

    if (!this.state.isRunning) {
      this.renderer.render(this.scene, this.camera)
      this.cameraControls.update()
      requestAnimationFrame(this.moveCameraWhilePaused) // endless animation loop
    }
  }

  private setVisibleClock() {
    const hour = Math.floor(this.simulationTime / 3600)
    const minute = Math.floor(this.simulationTime / 60) % 60
    this.$store.commit(
      'setClock',
      (hour < 10 ? '0' : '') + hour + (minute < 10 ? ':0' : ':') + minute
    )
  }

  private animate() {
    // update all the time & clock tickers
    const elapsedTicks = this.clock.getElapsedTime()

    const timeDelta =
      this.timeFactor * this.speed * (elapsedTicks - this.animationTimeSinceUnpaused)

    this.animationTimeSinceUnpaused = elapsedTicks

    this.simulationTime = this.simulationTime + timeDelta

    // are we done?
    if (this.simulationTime < 0.0) {
      this.$store.commit('setSimulation', false)
      this.simulationTime = 0
    } else if (this.simulationTime > 86400) {
      this.$store.commit('setSimulation', false)
      this.simulationTime = 86400 - 1
    }

    // tell agents to move their butts
    if (this.agentMaterial)
      this.agentMaterial.uniforms['simulationTime'].value = this.simulationTime

    // update statusbar, clocks, etc
    if (this.simulationTime * this.timeDirection >= this.nextClockUpdateTime * this.timeDirection) {
      this.setVisibleClock()
      this.nextClockUpdateTime += 60 * this.timeDirection
      EventBus.$emit(EventBus.SIMULATION_PERCENT, this.simulationTime / 86400)
    }

    if (this.camera) this.renderer.render(this.scene, this.camera)
    this.cameraControls.update()

    if (this.state.isRunning) requestAnimationFrame(this.animate) // endless animation loop
  }
}
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped lang="scss">
@import '@/styles.scss';

#anim-container {
  margin: 0 0;
  padding: 0 0;
  position: absolute;
  width: 100%;
  top: 0;
  bottom: 0;
  z-index: -1;
}
</style>

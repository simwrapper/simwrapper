<template lang="pug">
#anim-container

</template>

<script lang="ts">
import { defineComponent } from 'vue'

import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import * as THREE from 'three'

import globalStore from '@/store'
import {
  Agent,
  ColorScheme,
  ColorSet,
  FileSystem,
  Infection,
  Health,
  DARK_MODE,
  LIGHT_MODE,
} from '@/Globals'

import AgentGeometry from './AgentGeometry'
import EventBus from '@/plugins/agent-animation/EventBus.vue'
import XmlFetcher from '@/workers/XmlFetcher'

import vertexShader from './shaderVert.vert'
import fragmentShader from './shaderFrag.frag'
import { MapControls } from '@/js/OrbitControl'

export interface Network {
  nodes: { [id: string]: NetworkNode }
  links: { [id: string]: NetworkLink }
}

export interface NetworkNode {
  x: number
  y: number
}

export interface NetworkLink {
  readonly from: string
  readonly to: string
}

export default defineComponent({
  name: 'AnimationView',
  props: {
    fileApi: Object,
    subfolder: String,
    yamlConfig: String,
    thumbnail: Boolean,
    speed: { type: Number, required: true },
    vizState: { type: Object, required: true },
    vizDetails: { type: Object, required: true },
  },
  data: () => {
    return {
      timeFactor: 600.0,
      myState: {} as any,
      timeDirection: 1,
      globalState: globalStore.state,
      colors: {} as any,
      // keep track of time - current time in the simulation itself
      simulationTime: 0,
      // Count te seconds since the clock started running;
      // Every pause resets the anim clock to zero!
      animationTimeSinceUnpaused: 0,
      clock: new THREE.Clock(false), // do not autostart clock!
      // when to next update the visible clock
      nextClockUpdateTime: 0,
      scene: new THREE.Scene(),
      renderer: new THREE.WebGLRenderer({ antialias: true }),
      camera: {} as THREE.PerspectiveCamera,
      network: { nodes: {}, links: {} } as Network,
      // eslint-disable-next-line
      container: null as any,
      // eslint-disable-next-line
      cameraControls: null as any,
      linkMaterial: {} as THREE.LineBasicMaterial,
      xRange: [1e25, -1e25],
      yRange: [1e25, -1e25],
      // berlin
      midpointX: 360000,
      midpointY: 5715000,
      tripList: {} as { [id: string]: Agent },
      wasSimulationRunning: true,
      networkLayers: [] as THREE.LineSegments[],
      _roadFetcher: null as XmlFetcher | null,
      agentMaterial: null as THREE.ShaderMaterial | null,
      agentGeometry: null as AgentGeometry | null,
    }
  },
  watch: {
    speed() {
      this.myState.isRunning = true

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
    },

    'myState.isRunning'() {
      if (this.myState.isRunning) {
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
    },

    'myState.colorScheme'() {
      this.colors = this.myState.colorScheme == ColorScheme.LightMode ? LIGHT_MODE : DARK_MODE

      // background
      this.scene.background = new THREE.Color(this.colors.background)

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
    },
  },
  methods: {
    setInitialClockTime() {
      // set specified time, if we got one
      const secondsParam = '' + this.$route.query.start
      if (secondsParam && parseInt(secondsParam) != NaN) {
        const seconds = parseInt(secondsParam)
        // if (seconds >= 0 || seconds < 86400) {
        if (seconds >= 0) {
          this.simulationTime = seconds
          this.setVisibleClock()
          this.$nextTick()
        }
      }
    },

    handleVisibilityChange() {
      console.log('window visibility changed!! hidden:', document.hidden)
      //  this.myState.isRunning = document.hidden ? false : true
    },

    setupDragListener() {
      const parent = this
      EventBus.$on(EventBus.DRAG, function (seconds: number) {
        if (seconds === -1) {
          // start drag
          parent.wasSimulationRunning = parent.myState.isRunning
          parent.myState.isRunning = false
        } else if (seconds === -2) {
          // end drag
          parent.myState.isRunning = parent.wasSimulationRunning
        } else {
          // dragging
          parent.simulationTime = parent.nextClockUpdateTime = seconds
          parent.animate()
        }
      })
    },

    exitSimulation() {
      this.clock = new THREE.Clock(false)
      this.simulationTime = 0
      this.nextClockUpdateTime = 0
      this.timeDirection = 1

      while (this.scene.children.length) {
        this.scene.remove(this.scene.children[0])
      }
    },

    onWindowResize() {
      this.container = document.getElementById('anim-container')
      if (!this.container || !this.camera) return

      const canvas = this.renderer.domElement

      //@ts-ignore
      this.camera.aspect = this.container.clientWidth / this.container.clientHeight
      //@ts-ignore
      this.camera.updateProjectionMatrix()

      this.renderer.setSize(this.container.clientWidth, this.container.clientHeight)
    },

    async setupSimulation() {
      this.initScene()

      this.myState.statusMessage = 'loading agents'

      await this.loadTrips()
      this.finishedLoadingTrips()

      // this can happen in the background
      await this.addNetworkToScene()
    },

    startSimulation() {
      // let UI know we're about to begin!
      this.$emit('loaded', true)

      if (!this.myState.isShowingHelp) {
        this.clock.start()
        this.animate()
        this.myState.isRunning = true
      }
    },

    async networkLayerAdder(nodes: any, netlinks: any[], index: number) {
      const batchSize = 20000

      if (index > netlinks.length) {
        this.myState.statusMessage = ''
        this.startSimulation()
        return
      }

      const links: THREE.BufferGeometry[] = []
      const start = index
      const end = index + batchSize > netlinks.length ? netlinks.length : index + batchSize

      let countBad = 0
      for (let i = start; i < end; i++) {
        const link = netlinks[i]
        const nodeFrom = nodes[link.from]
        const nodeTo = nodes[link.to]
        if (!nodeFrom || !nodeTo) {
          countBad++
          if (countBad < 20) console.log({ badlink: link })
        } else {
          const from = new THREE.Vector3(nodeFrom.x, nodeFrom.y, 0)
          const to = new THREE.Vector3(nodeTo.x, nodeTo.y, 0)
          const segment = new THREE.BufferGeometry().setFromPoints([from, to])

          links.push(segment)
        }
      }

      // console.log(countBad, 'BAD LINKS')

      const mergedLines = BufferGeometryUtils.mergeBufferGeometries(links)
      const networkMesh = new THREE.LineSegments(mergedLines, this.linkMaterial)

      networkMesh.name = 'network' + index

      this.scene.add(networkMesh)
      //@ts-ignore
      if (this.camera) this.renderer.render(this.scene, this.camera)

      this.networkLayers.push(networkMesh)
      mergedLines.dispose()

      // start the next batch. 1ms timeout required so UI doesn't freeze
      const nextIndex = index + batchSize
      setTimeout(() => {
        this.networkLayerAdder(nodes, netlinks, nextIndex)
      }, 1)
    },

    createNodesAndLinksFromXML(xml: any) {
      const roadXML = xml
      const netNodes = roadXML.network.nodes[0].node
      const netLinks = roadXML.network.links[0].link

      for (const node of netNodes) {
        const attr = node.$
        attr.x = parseFloat(attr.x)
        attr.y = parseFloat(attr.y)
        this.network.nodes[attr.id] = attr
      }

      for (const link of netLinks) {
        const attr = link.$
        this.network.links[attr.id] = attr
      }
    },

    async addNetworkToScene() {
      this.myState.statusMessage = 'loading network'
      this.networkLayers = []

      try {
        if (!this.myState.fileSystem) return

        console.log({ vizDetails: this.vizDetails })

        // fetch XML
        this._roadFetcher = await XmlFetcher.create({
          fileApi: this.myState.fileSystem.url,
          filePath: this.myState.subfolder + '/' + this.vizDetails.network,
        })

        const xml = await this._roadFetcher.fetchXML()
        this._roadFetcher.destroy()

        console.log({ xml })
        // Extract nodes and links
        this.createNodesAndLinksFromXML(xml)

        // eslint-disable-next-line
        const nodes: any = {}
        for (const id in this.network.nodes) {
          const node = this.network.nodes[id]
          nodes[id] = { x: node.x - this.midpointX, y: node.y - this.midpointY }
        }

        this.networkLayerAdder(nodes, Object.values(this.network.links), 0)
      } catch (e) {
        console.error({ e })
        this.myState.statusMessage = '' + e
      }

      // // eslint-disable-next-line
      // const nodes: any = {}
      // for (const node of network.nodes) {
      //   nodes[node.node_id] = { x: node.x - this.midpointX, y: node.y - this.midpointY }
      // }

      // console.log('network has links:', network.links.length)

      // this.networkLayerAdder(nodes, network.links, 0)
    },

    async loadTrips() {
      this.tripList = {}

      try {
        const text = await this.myState.fileApi.getFileText(
          this.myState.subfolder + '/' + this.vizDetails.drtTrips
        )

        for (const ndjson of text.split('\n')) {
          if (!!ndjson) {
            const agent: Agent = JSON.parse(ndjson)
            this.tripList[agent.id] = agent
          }
        }
      } catch (e) {
        // maybe it failed because password?
        const err = e as any
        if (
          this.myState.fileSystem &&
          this.myState.fileSystem.need_password &&
          err.status === 401
        ) {
          globalStore.commit('requestLogin', this.myState.fileSystem.url)
        }
      }
    },

    finishedLoadingTrips() {
      if (this.agentGeometry) this.agentGeometry.dispose()
      this.agentGeometry = new AgentGeometry(this.tripList, this.midpointX, this.midpointY)

      if (!this.agentMaterial)
        this.agentMaterial = new THREE.ShaderMaterial({
          uniforms: {
            simulationTime: { value: 0.0 },
            colorLinks: { value: new THREE.Color(this.colors.links) },
          },
          vertexShader: vertexShader,
          fragmentShader: fragmentShader,
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

      //@ts-ignore
      if (this.camera) this.renderer.render(this.scene, this.camera)
      this.myState.statusMessage = 'loading network'
    },

    initScene() {
      this.container = document.getElementById('anim-container')
      if (!this.container) return

      this.scene.background = new THREE.Color(this.colors.background)

      this.renderer.setSize(this.container.clientWidth, this.container.clientHeight)
      this.container.appendChild(this.renderer.domElement)

      const near = 1
      const far = 100000

      //@ts-ignore
      this.camera = new THREE.PerspectiveCamera(
        170,
        this.container.clientWidth / this.container.clientHeight,
        near,
        far
      )
      this.cameraControls = MapControls(this.camera, this.renderer.domElement)
      this.cameraControls.enablePan = true
      this.cameraControls.screenSpacePanning = true
      this.cameraControls.enableZoom = true
      this.cameraControls.enableRotate = false

      //@ts-ignore
      this.camera.position.set(0, 0, 750)
      //@ts-ignore
      this.camera.lookAt(0, 0, -1)
      this.cameraControls.update()

      //@ts-ignore
      this.renderer.render(this.scene, this.camera)
    },

    moveCameraWhilePaused() {
      if (!this.camera) return

      if (!this.myState.isRunning) {
        //@ts-ignore
        this.renderer.render(this.scene, this.camera)
        this.cameraControls.update()
        requestAnimationFrame(this.moveCameraWhilePaused) // endless animation loop
      }
    },

    setVisibleClock() {
      const hour = Math.floor(this.simulationTime / 3600)
      const minute = Math.floor(this.simulationTime / 60) % 60
      this.myState.clock = (hour < 10 ? '0' : '') + hour + (minute < 10 ? ':0' : ':') + minute
    },

    animate() {
      // update all the time & clock tickers
      const elapsedTicks = this.clock.getElapsedTime()

      const timeDelta =
        this.timeFactor * this.speed * (elapsedTicks - this.animationTimeSinceUnpaused)

      this.animationTimeSinceUnpaused = elapsedTicks
      this.simulationTime = this.simulationTime + timeDelta

      // are we done?
      if (this.simulationTime < 0.0) {
        this.myState.isRunning = false
        this.simulationTime = 0
      }
      // } else if (this.simulationTime > 86400) {
      //   this.$store.commit('setSimulation', false)
      //   this.simulationTime = 86400 - 1
      // }

      // tell agents to move their butts
      if (this.agentMaterial)
        this.agentMaterial.uniforms['simulationTime'].value = this.simulationTime

      // update statusbar, clocks, etc
      if (
        this.simulationTime * this.timeDirection >=
        this.nextClockUpdateTime * this.timeDirection
      ) {
        this.setVisibleClock()
        this.nextClockUpdateTime += 60 * this.timeDirection
        EventBus.$emit(EventBus.SIMULATION_PERCENT, this.simulationTime / 86400)
      }

      if (this.camera) this.renderer.render(this.scene, this.camera)
      this.cameraControls.update()

      if (this.myState.isRunning) requestAnimationFrame(this.animate) // endless animation loop
    },
  },
  mounted() {
    this.myState = this.vizState as any
    this.linkMaterial = new THREE.LineBasicMaterial({ color: this.colors.links })
    this.colors = this.myState.colorScheme == ColorScheme.DarkMode ? DARK_MODE : LIGHT_MODE

    this.setInitialClockTime()
    this.setupSimulation()
    this.setupDragListener()

    window.addEventListener('resize', this.onWindowResize, false)
    document.addEventListener('visibilitychange', this.handleVisibilityChange, false)
  },
  beforeDestroy() {
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
    // this.scene.dispose()
  },
})
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped lang="scss">
@import '@/styles.scss';

#anim-container {
  margin: 0 0;
  padding: 0 0;
  width: 100%;
  z-index: -1;
}
</style>

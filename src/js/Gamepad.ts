import globalStore from '@/store'

const gamepads = {} as any
const MAX_MOVE = 30
const MAX_PITCH = 5
const FRICTION = 0.9

let isLooping = false
let isStopping = false
let dx = 0
let dy = 0
let dz = 0
let dpitch = 0
let dbearing = 0
let axis = 1

function gamepadHandler(event: any, connected: boolean) {
  const gamepad = event.gamepad
  // Note:
  // gamepad === navigator.getGamepads()[gamepad.index]

  if (connected) {
    gamepads[gamepad.index] = gamepad
    console.log('** GAMEPAD CONNECTED', gamepad)
    isLooping = true
    gamepadLoop()
  } else {
    delete gamepads[gamepad.index]
    isLooping = false
  }
}

function stop() {
  isLooping = false
  isStopping = true
}

function start() {
  if (isLooping || isStopping) {
    isStopping = false
    return
  }

  const gamepads = navigator.getGamepads().filter(g => !!g)
  if (gamepads.length) {
    console.log(gamepads)
    isLooping = true
    gamepadLoop()
  }
}

function setup() {
  window.addEventListener(
    'gamepadconnected',
    e => {
      gamepadHandler(e, true)
      // gamepadLoop()
    },
    false
  )
  window.addEventListener(
    'gamepaddisconnected',
    e => {
      gamepadHandler(e, false)
    },
    false
  )
}

function gamepadLoop() {
  if (!isLooping) return

  const gamepads = navigator.getGamepads()
  if (!gamepads) return

  // billy likes y-axis inverted
  axis = globalStore.state.gamepad
  // add friction
  dx = dx * FRICTION
  dy = dy * FRICTION
  dz = dz * FRICTION
  dpitch = dpitch * FRICTION * 0.8
  dbearing = dbearing * FRICTION * 0.9
  if (Math.abs(dx) < 0.25) dx = 0
  if (Math.abs(dy) < 0.25) dy = 0
  if (Math.abs(dz) < 0.2) dz = 0
  if (Math.abs(dpitch) < 0.25) dpitch = 0
  if (Math.abs(dbearing) < 0.25) dbearing = 0

  const gp = gamepads[0]
  // gp?.buttons.forEach((btn, i) => {
  //   if (btn.pressed) console.log(i, btn.value)
  // })

  // x
  if (Math.abs(gp?.axes[0] ?? 0) > 0.3) dx += axis * (gp?.axes[0] ?? 0)
  dx = Math.max(-MAX_MOVE, Math.min(MAX_MOVE, dx))
  // y
  if (Math.abs(gp?.axes[1] ?? 0) > 0.3) dy += axis * (gp?.axes[1] ?? 0)
  dy = Math.max(-MAX_MOVE, Math.min(MAX_MOVE, dy))

  if (gp?.buttons[7].pressed || gp?.buttons[5].pressed) {
    // pitch
    if (Math.abs(gp?.axes[3] ?? 0) > 0.3) dpitch -= gp?.axes[3] ?? 0
    dpitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, dpitch))
    // bearing
    if (Math.abs(gp?.axes[2] ?? 0) > 0.3) dbearing -= axis * (gp?.axes[2] ?? 0)
    dbearing = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, dbearing))
  } else {
    // zoom
    if (Math.abs(gp?.axes[3] ?? 0) > 0.3) dz = gp?.axes[3] ?? 0
  }

  const mapConfig = globalStore.state.viewState
  const factor = 2 ** mapConfig.zoom
  const zoom = Math.max(3, mapConfig.zoom - 0.06 * dz)
  let pitch = mapConfig.pitch + dpitch
  pitch = Math.max(0, Math.min(70, pitch))

  let longitude = mapConfig.longitude
  let latitude = mapConfig.latitude

  // Apply rotation transformation to dx, dy movement
  if (dx || dy) {
    const bearingRad = (mapConfig.bearing * Math.PI) / 180
    const rotatedDx = dx * Math.cos(bearingRad) - dy * Math.sin(bearingRad)
    const rotatedDy = dx * Math.sin(bearingRad) + dy * Math.cos(bearingRad)
    longitude = mapConfig.longitude + rotatedDx / factor
    longitude = Math.max(-180, Math.min(longitude, 180))
    latitude = mapConfig.latitude - rotatedDy / factor
    latitude = Math.max(-80, Math.min(latitude, 80))
    dbearing = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, dbearing))
  }

  let bearing = mapConfig.bearing + 0.5 * dbearing
  // Press A/B to clear
  if (gp?.buttons[0].pressed || gp?.buttons[1].pressed) {
    dx = dy = dz = dpitch = dbearing = 0
    bearing = 0.6 * bearing
    pitch = 0.6 * pitch
    if (Math.abs(bearing) < 2) bearing = 0
    if (pitch < 2) pitch = 0
  }

  globalStore.commit('setMapCamera', { longitude, latitude, zoom, pitch, bearing })

  requestAnimationFrame(gamepadLoop)
}

export default { setup, stop, start }

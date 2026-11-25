import globalStore from '@/store'

const gamepads: { [index: number]: Gamepad } = {}
const MAX_MOVE = 10
const MAX_PITCH = 5
const FRICTION = 0.5

let isLooping = false
let isStopping = false
let rafHandle = 0
let listenersAdded = false
let dx = 0
let dy = 0
let dz = 0
let dpitch = 0
let dbearing = 0
let axis = 1

function firstPad(pads: readonly (Gamepad | null)[] | null): Gamepad | null {
  if (!pads) return null
  for (let i = 0; i < pads.length; i++) {
    if (pads[i]) return pads[i]
  }
  return null
}

function buttonPressed(pad: Gamepad | null, index: number): boolean {
  return !!pad?.buttons?.[index]?.pressed
}

function axisValue(pad: Gamepad | null, index: number): number {
  const value = pad?.axes?.[index]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function haltLoop() {
  isLooping = false
  if (rafHandle) {
    cancelAnimationFrame(rafHandle)
    rafHandle = 0
  }
}

function scheduleLoop() {
  // one rAF chain only: a pending frame means the loop is already alive
  if (rafHandle) return
  isLooping = true
  rafHandle = requestAnimationFrame(gamepadLoop)
}

function gamepadHandler(event: GamepadEvent | null | undefined, connected: boolean) {
  const gamepad = event?.gamepad
  if (!gamepad) return

  if (connected) {
    gamepads[gamepad.index] = gamepad
    console.log('** GAMEPAD CONNECTED', gamepad)
    scheduleLoop()
  } else {
    delete gamepads[gamepad.index]
    // only halt if no other pad remains connected
    const remaining = navigator.getGamepads ? firstPad(navigator.getGamepads()) : null
    if (!remaining) haltLoop()
  }
}

function stop() {
  haltLoop()
  isStopping = true
}

function start() {
  if (isLooping || isStopping) {
    isStopping = false
    return
  }

  // in local contexts (file:// URLs), gamepad doesn't exist
  if (!navigator.getGamepads) return

  const pads = navigator.getGamepads()
  if (firstPad(pads)) {
    scheduleLoop()
  }
}

function setup() {
  if (listenersAdded) return
  listenersAdded = true

  window.addEventListener(
    'gamepadconnected',
    e => {
      gamepadHandler(e, true)
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
  rafHandle = 0

  if (!isLooping) return

  try {
    if (!navigator.getGamepads) {
      haltLoop()
      return
    }
    const pads = navigator.getGamepads()
    if (!pads) {
      haltLoop()
      return
    }

    // billy likes y-axis inverted
    axis = globalStore.state.gamepad === -1 ? -1 : 1
    // add friction
    dx = dx * FRICTION
    dy = dy * FRICTION
    dz = dz * FRICTION
    dpitch = dpitch * FRICTION * 0.8
    dbearing = dbearing * FRICTION * 0.9
    if (Math.abs(dx) < 0.25) dx = 0
    if (Math.abs(dy) < 0.25) dy = 0
    if (Math.abs(dz) < 0.1) dz = 0
    if (Math.abs(dpitch) < 0.25) dpitch = 0
    if (Math.abs(dbearing) < 0.25) dbearing = 0

    // use the first pad that actually exists, not just slot 0
    const gp = firstPad(pads)

    // x
    const xAxis = axisValue(gp, 0)
    if (Math.abs(xAxis) > 0.3) dx += axis * xAxis
    dx = Math.max(-MAX_MOVE, Math.min(MAX_MOVE, dx))
    // y
    const yAxis = axisValue(gp, 1)
    if (Math.abs(yAxis) > 0.3) dy += axis * yAxis
    dy = Math.max(-MAX_MOVE, Math.min(MAX_MOVE, dy))

    if (buttonPressed(gp, 7) || buttonPressed(gp, 5)) {
      // pitch
      const upDown = axisValue(gp, 3)
      if (Math.abs(upDown) > 0.3) dpitch -= upDown
      dpitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, dpitch))
      // bearing
      const twist = axisValue(gp, 2)
      if (Math.abs(twist) > 0.3) dbearing -= axis * twist
      dbearing = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, dbearing))
    } else {
      // zoom
      const zoomAxis = axisValue(gp, 3)
      if (Math.abs(zoomAxis) > 0.2) dz = zoomAxis
    }

    const mapConfig = globalStore.state.viewState
    const factor = 2 ** mapConfig.zoom
    const zoom = Math.max(3, mapConfig.zoom - 0.03 * dz)
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
    if (buttonPressed(gp, 0) || buttonPressed(gp, 1)) {
      dx = dy = dz = dpitch = dbearing = 0
      bearing = 0.6 * bearing
      pitch = 0.6 * pitch
      if (Math.abs(bearing) < 2) bearing = 0
      if (pitch < 2) pitch = 0
    }

    // never let a bad camera value reach the store, where it would poison every map
    if (![longitude, latitude, zoom, pitch, bearing].every(Number.isFinite)) {
      haltLoop()
      console.warn('** GAMEPAD LOOP STOPPED: computed a non-finite camera', {
        longitude,
        latitude,
        zoom,
        pitch,
        bearing,
      })
      return
    }

    globalStore.commit('setMapCamera', { longitude, latitude, zoom, pitch, bearing })
  } catch (error) {
    haltLoop()
    console.warn('** GAMEPAD LOOP STOPPED:', error)
    return
  }

  if (isLooping) rafHandle = requestAnimationFrame(gamepadLoop)
}

export default { setup, stop, start }

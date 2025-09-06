// screenshot helper functions
// found most of this at:
// (1) https://github.com/visgl/deck.gl/issues/4436
// (2) https://stackoverflow.com/questions/32096540/merge-two-datauris-to-create-a-single-image

// import { DeckGLLayer } from '@flowmap.gl/core'
import { MapboxOverlay } from '~/@deck.gl/mapbox/dist'

export function saveMapWithOverlay(map: any) {
  const mapCanvas = map.getCanvas()
  const dataUrl = mapCanvas.toDataURL('image/png')
  const link = document.createElement('a')
  link.download = 'simwrapper-screenshot.png'
  link.href = dataUrl
  link.click()
}

export async function savePNG(layer: any, backgroundCanvas: HTMLCanvasElement) {
  const deckLayerImage = layer.context.deck.canvas.toDataURL('image/png')
  const backgroundImage = backgroundCanvas?.toDataURL('image/png')

  const layerData = []
  if (backgroundImage) layerData.push(backgroundImage)
  layerData.push(deckLayerImage)

  // convert deck+map to image URL, with added watermark
  const mergedImage = await mergeImageURIs({
    width: layer.context.deck.canvas.width,
    height: layer.context.deck.canvas.height,
    imageDataURLs: layerData,
  })

  var element = document.createElement('a')
  element.setAttribute('href', mergedImage)
  element.setAttribute('download', 'screenshot.png')
  element.style.display = 'none'

  document.body.appendChild(element)
  element.click()
  document.body.removeChild(element)
}

// copypasta from
// https://stackoverflow.com/questions/32096540/merge-two-datauris-to-create-a-single-image
function mergeImageURIs(props: { width: number; height: number; imageDataURLs: string[] }) {
  return new Promise<any>((resolve, reject) => {
    var canvas = document.createElement('canvas')
    canvas.width = props.width
    canvas.height = props.height

    Promise.all(props.imageDataURLs.map(dataURL => add2canvas(canvas, dataURL))).then(() => {
      // add watermark
      const ctx = canvas.getContext('2d') as any
      const boxLeft = canvas.width - 152
      const boxTop = canvas.height - 8
      ctx.beginPath()
      ctx.rect(boxLeft - 4, boxTop - 14, 158, 22)
      ctx.fillStyle = '#ffffff44'
      ctx.fill()
      ctx.font = '11px Arial'
      ctx.fillStyle = '#888'
      ctx.fillText('© Mapbox  © OpenStreetMap', boxLeft, boxTop)

      // return final dataURL with fully-built image
      resolve(canvas.toDataURL('image/png'))
    })
  })
}

function add2canvas(canvas: any, dataURL: string) {
  return new Promise((resolve, reject) => {
    if (!canvas) reject()
    if (!dataURL) reject()

    var image = new Image()

    image.onload = function () {
      canvas.getContext('2d').drawImage(this, 0, 0)
      resolve(true)
    }
    image.src = dataURL
  })
}

export default { savePNG, saveMapWithOverlay }

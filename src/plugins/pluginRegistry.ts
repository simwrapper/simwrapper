// import plugins in the order you want them to appear on project pages
import CarrierViewer from '@/plugins/carrier-viewer/Plugin.vue'
import VehicleAnimation from '@/plugins/vehicle-animation/VehicleAnimation.vue'
import XyHexagons from '@/plugins/xy-hexagons/XyHexagons.vue'
import AgentAnimation from '@/plugins/agent-animation/AgentAnimation.vue'
import LinksGl from '@/plugins/links-gl/LinkVolumes.vue'
import LinkVolumes from '@/plugins/link-vols/LinkVolumes.vue'
import ShapeFile from '@/plugins/shape-file/ShapeFile.vue'
import SankeyDiagram from '@/plugins/sankey/SankeyDiagram.vue'
import VegaLite from '@/plugins/vega-lite/VegaLite.vue'
import AggregateOd from '@/plugins/aggregate-od/AggregateOd.vue'
import TransitSupply from '@/plugins/transit-supply/TransitSupply.vue'
import VideoPlayer from '@/plugins/video-player/VideoPlayer.vue'
import ImageView from '@/plugins/image/ImageView.vue'

// EVERY plugin must be registered here:
const plugins = {
  VehicleAnimation,
  CarrierViewer,
  XyHexagons,
  AgentAnimation,
  LinksGl,
  LinkVolumes,
  ShapeFile,
  SankeyDiagram,
  VegaLite,
  AggregateOd,
  TransitSupply,
  VideoPlayer,
  ImageView,
}

export default plugins

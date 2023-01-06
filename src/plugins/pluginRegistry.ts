// import plugins in the order you want them to appear on project pages
import XmasKelheim from '@/plugins/xmas-kelheim/VehicleAnimation.vue'
import Events from '@/plugins/event-viewer/EventViewer.vue'
import CarrierViewer from '@/plugins/carrier-viewer/CarrierViewer.vue'
import VehicleView from '@/plugins/vehicle-animation/VehicleAnimation.vue'
import Summary from '@/plugins/calculation-table/CalculationTable.vue'
import Network from '@/plugins/links-gl/NetworkLinks.vue'
import Transit from '@/plugins/transit-demand/TransitDemand.vue'
import AggregateOd from '@/plugins/aggregate-od/AggregateOd.vue'
import Sankey from '@/plugins/sankey/SankeyDiagram.vue'
import VegaLite from '@/plugins/vega-lite/VegaLite.vue'
import VidPlayer from '@/plugins/video-player/VideoPlayer.vue'
import ImageView from '@/plugins/image/ImageView.vue'
import AreaMap from '@/plugins/shape-file/ShapeFile.vue'
import Hexagons from '@/plugins/xy-hexagons/XyHexagons.vue'
import XYT from '@/plugins/xy-time/XyTime.vue'
import Flowmap from '@/plugins/flowmap/Flowmap.vue'

// // EVERY plugin must also be exported here:
const plugins = {
  Summary,
  AggregateOd,
  Events,
  AreaMap,
  Network,
  Transit,
  CarrierViewer,
  Hexagons,
  Sankey,
  VegaLite,
  VehicleView,
  XYT,
  VidPlayer,
  ImageView,
  XmasKelheim,
  Flowmap,
}

export default plugins

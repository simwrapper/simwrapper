// import plugins in the order you want them to appear on project pages
import Events from '@/plugins/event-viewer/EventViewer.vue'
import CarrierViewer from '@/plugins/carrier-viewer/CarrierViewer.vue'
import VehicleView from '@/plugins/vehicle-animation/VehicleAnimation.vue'
import Summary from '@/plugins/calculation-table/CalculationTable.vue'
import Network from '@/plugins/links-gl/NetworkLinks.vue'
import Transit from '@/plugins/transit-demand/TransitDemand.vue'
import AggregateOd from '@/plugins/aggregate-od/AggregateOd.vue'
import Sankey from '@/plugins/sankey/SankeyDiagram.vue'
import VegaChart from '@/plugins/vega-lite/VegaLite.vue'
import VidPlayer from '@/plugins/video-player/VideoPlayer.vue'
import ImageView from '@/plugins/image/ImageView.vue'
import Map from '@/plugins/shape-file/FancyPolygonMap.vue'
import Hexagons from '@/plugins/xy-hexagons/XyHexagons.vue'
import XYT from '@/plugins/xy-time/XyTime.vue'

// // EVERY plugin must also be exported here:
const plugins = {
  Summary,
  AggregateOd,
  Events,
  Map,
  Network,
  Transit,
  CarrierViewer,
  Hexagons,
  Sankey,
  VegaChart,
  VehicleView,
  XYT,
  VidPlayer,
  ImageView,
}

export default plugins

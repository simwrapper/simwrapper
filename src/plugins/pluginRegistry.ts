// import plugins in the order you want them to appear on project pages
import CarrierViewer from '@/plugins/carrier-viewer/CarrierViewer.vue'
import VehicleView from '@/plugins/vehicle-animation/VehicleAnimation.vue'
import CalcTable from '@/plugins/calculation-table/CalculationTable.vue'
import LinkView from '@/plugins/links-gl/LinkVolumes.vue'
import TransitView from '@/plugins/transit-demand/TransitDemand.vue'
import AggregateOd from '@/plugins/aggregate-od/AggregateOd.vue'
import SankeyDiag from '@/plugins/sankey/SankeyDiagram.vue'
import VegaLite from '@/plugins/vega-lite/VegaLite.vue'
import VideoPlayer from '@/plugins/video-player/VideoPlayer.vue'
import ImageView from '@/plugins/image/ImageView.vue'
import MapView from '@/plugins/shape-file/FancyPolygonMap.vue'
import XyHex from '@/plugins/xy-hexagons/XyHexagons.vue'
import XYT from '@/plugins/xy-time/XyTime.vue'

// // EVERY plugin must also be exported here:
const plugins = {
  AggregateOd,
  CalcTable,
  CarrierViewer,
  ImageView,
  LinkView,
  MapView,
  SankeyDiag,
  TransitView,
  VegaLite,
  VehicleView,
  VideoPlayer,
  XyHex,
  XYT,
}

export default plugins

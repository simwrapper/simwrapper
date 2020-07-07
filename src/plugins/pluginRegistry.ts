// import the plugins in the order you want them to appear on project pages
import SankeyDiagram from '@/plugins/sankey/SankeyDiagram.vue'
import ImageView from '@/plugins/image/ImageView.vue'

// EVERY plugin must be registered here:
const plugins = { SankeyDiagram, ImageView }

export default plugins

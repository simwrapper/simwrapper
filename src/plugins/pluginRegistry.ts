// import the plugins in the order you want them to appear on project pages
import AgentAnimation from '@/plugins/agent-animation/AgentAnimation.vue'
import SankeyDiagram from '@/plugins/sankey/SankeyDiagram.vue'
import AggregateOd from '@/plugins/aggregate-od/AggregateOd.vue'
import TransitSupply from '@/plugins/transit-supply/TransitSupply.vue'
import ImageView from '@/plugins/image/ImageView.vue'

// EVERY plugin must be registered here:
const plugins = { AgentAnimation, SankeyDiagram, AggregateOd, TransitSupply, ImageView }

export default plugins
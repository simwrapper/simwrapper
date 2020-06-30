<script lang="ts">
import { Vue, Component } from 'vue-property-decorator'

@Component
class EventBusClass extends Vue {
  public SIMULATION_PERCENT: string = 'sim-percent'
  public DRAG: string = 'sim-drag'

  constructor() {
    super()
  }
}

export default new EventBusClass()
</script>

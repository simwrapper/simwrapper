<script lang="ts">
import { defineComponent } from 'vue'

const Component = defineComponent({
  name: 'EventBusAnimation',
  data: () => {
    return {
      SIMULATION_PERCENT: 'sim-percent',
      DRAG: 'sim-drag',
    }
  },
})

export default new Component()
</script>

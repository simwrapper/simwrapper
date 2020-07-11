<template lang="pug">
#project-summary-block
  .project-name(@click="goBack")
    i.fa.fa-arrow-left
    span &nbsp;&nbsp;{{ project.name}}
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator'
import ProjectStore from '@/project/ProjectStore'
import Project from '@/project/Project.vue'

@Component
export default class ProjectSummaryBlock extends Vue {
  @Prop({ type: Object, required: true })
  private project!: any

  @Prop({ type: String, required: true })
  private projectId!: string

  public created() {}

  private goBack() {
    this.$router.go(-1)
  }
}
</script>

<style scoped>
#project-summary-block {
  display: flex;
  flex-direction: row;
  color: white;
  background-color: #363a45;
  padding: 1rem 1rem;
  text-align: center;
}

.project-name {
  color: white;
  font-weight: bold;
  font-size: 1.2rem;
  margin: 0px auto;
}

.project-name:hover {
  color: #ff8;
  cursor: pointer;
}
</style>

// Custom GLSL Shader for 1000x performance, we hope!
import * as THREE from 'three'

import { AgentProgessingThroughDisease } from '@/Globals'

class AgentGeometry extends THREE.BufferGeometry {
  private midX: number
  private midY: number

  constructor(agentList: any, midX: number, midY: number) {
    super()

    this.midX = midX
    this.midY = midY

    const position: number[] = []

    const s1: number[] = []
    const s2: number[] = []
    const s3: number[] = []
    const s4: number[] = []
    const s5: number[] = []
    const s6: number[] = []

    for (const agent of agentList) {
      this.buildWaypoints(agent, position, s1, s2, s3, s4, s5, s6)
    }

    this.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
    this.setAttribute('s1', new THREE.Float32BufferAttribute(s1, 1))
    this.setAttribute('s2', new THREE.Float32BufferAttribute(s2, 1))
    this.setAttribute('s3', new THREE.Float32BufferAttribute(s3, 1))
    this.setAttribute('s4', new THREE.Float32BufferAttribute(s4, 1))
    this.setAttribute('s5', new THREE.Float32BufferAttribute(s5, 1))
    this.setAttribute('s6', new THREE.Float32BufferAttribute(s6, 1))
  }

  private buildWaypoints(
    agent: AgentProgessingThroughDisease,
    position: number[],
    s1: number[],
    s2: number[],
    s3: number[],
    s4: number[],
    s5: number[],
    s6: number[]
  ) {
    position.push(agent.x - this.midX, agent.y - this.midY, 0.0)

    s1.push(agent.infectedButNotContagious)
    s2.push(agent.contagious)
    s3.push(agent.showingSymptoms)
    s4.push(agent.seriouslySick)
    s5.push(agent.critical)
    s6.push(agent.recovered)
  }
}

export default AgentGeometry

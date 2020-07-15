// Custom GLSL Shader for 1000x performance, we hope!
import * as THREE from 'three'

import { Agent, Infection } from '@/Globals'

class AgentGeometry extends THREE.BufferGeometry {
  private midX: number
  private midY: number
  private tripsPerAgent: { [id: string]: number } = {}

  constructor(agentList: { [id: string]: Agent }, midX: number, midY: number) {
    super()

    this.midX = midX
    this.midY = midY

    const point1: number[] = [] // x,y,time
    const point2: number[] = [] // x,y,time

    for (const id of Object.keys(agentList)) {
      const agent = agentList[id]
      this.buildWaypoints(agent, point1, point2)
    }

    this.setAttribute('position', new THREE.Float32BufferAttribute(point1, 3))
    this.setAttribute('position2', new THREE.Float32BufferAttribute(point2, 3))
  }

  private buildWaypoints(agent: Agent, point1: number[], point2: number[]) {
    const numWaypoints = agent.time.length
    if (numWaypoints < 2) return // skip empty trips!

    let numTrips = 0

    // if first trip starts at nonzero, start them at zero anyway
    if (agent.time[0] !== 0.0) {
      const x = agent.path[0][0] - this.midX
      const y = agent.path[0][1] - this.midY
      const t = agent.time[0]
      point1.push(x, y, 0)
      point2.push(x, y, t)

      numTrips++
    }

    // create trips for all waypoint combos
    for (let i = 0; i < numWaypoints - 1; i++) {
      const x = agent.path[i][0] - this.midX
      const y = agent.path[i][1] - this.midY
      const t = agent.time[i]
      point1.push(x, y, t)

      const x2 = agent.path[i + 1][0] - this.midX
      const y2 = agent.path[i + 1][1] - this.midY
      const t2 = agent.time[i + 1]
      point2.push(x2, y2, t2)

      numTrips++
    }

    // // keep person on map at end of day
    // if (agent.time[numWaypoints - 1] !== 86400.0) {
    //   const x = agent.path[numWaypoints - 1][0] - this.midX
    //   const y = agent.path[numWaypoints - 1][1] - this.midY
    //   const t = agent.time[numWaypoints - 1]
    //   point1.push(x, y, t)
    //   point2.push(x, y, 86400.0)

    //   numTrips++
    // }

    this.tripsPerAgent[agent.id] = numTrips
  }
}

export default AgentGeometry

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

    const infectionTimes: number[] = []
    const infectionTypes: number[] = []

    for (const id of Object.keys(agentList)) {
      const agent = agentList[id]

      this.buildWaypoints(agent, point1, point2, infectionTimes, infectionTypes)
    }

    this.setAttribute('position', new THREE.Float32BufferAttribute(point1, 3))
    this.setAttribute('position2', new THREE.Float32BufferAttribute(point2, 3))

    this.setAttribute('infectionTime', new THREE.Float32BufferAttribute(infectionTimes, 3))
    this.setAttribute('infectionStatus', new THREE.Float32BufferAttribute(infectionTypes, 3))

    const ram = 2 * 3 * point1.length + 2 * 3 * infectionTimes.length
    console.log('######## GPU RAM:', ram)
  }

  updateInfections(infections: { [id: string]: Infection }) {
    const infectionTimes: number[] = []
    const infectionTypes: number[] = []

    for (const id of Object.keys(infections)) {
      const agent = infections[id]

      const numTrips = this.tripsPerAgent[agent.id]

      for (let i = 0; i < numTrips; i++) {
        infectionTimes.push(...agent.dtime)
        infectionTypes.push(...agent.d)
      }
    }

    this.setAttribute('infectionTime', new THREE.Float32BufferAttribute(infectionTimes, 3))
    this.setAttribute('infectionStatus', new THREE.Float32BufferAttribute(infectionTypes, 3))
  }

  private buildWaypoints(
    agent: Agent,
    point1: number[],
    point2: number[],
    infectionTimes: number[],
    infectionTypes: number[]
  ) {
    const numWaypoints = agent.time.length
    if (numWaypoints < 2) return // skip empty trips!

    const infectTimes = AgentGeometry.buildInfectionTimes(agent)
    const infectTypes = AgentGeometry.buildInfectionTypes(agent)

    let numTrips = 0

    // if first trip starts at nonzero, start them at zero anyway
    if (agent.time[0] !== 0.0) {
      const x = agent.path[0][0] - this.midX
      const y = agent.path[0][1] - this.midY
      const t = agent.time[0]
      point1.push(x, y, 0)
      point2.push(x, y, t)

      infectionTimes.push(...infectTimes)
      infectionTypes.push(...infectTypes)
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

      infectionTimes.push(...infectTimes)
      infectionTypes.push(...infectTypes)

      numTrips++
    }

    // keep person on map at end of day
    if (agent.time[numWaypoints - 1] !== 86400.0) {
      const x = agent.path[numWaypoints - 1][0] - this.midX
      const y = agent.path[numWaypoints - 1][1] - this.midY
      const t = agent.time[numWaypoints - 1]
      point1.push(x, y, t)
      point2.push(x, y, 86400.0)

      infectionTimes.push(...infectTimes)
      infectionTypes.push(...infectTypes)

      numTrips++
    }

    this.tripsPerAgent[agent.id] = numTrips
  }

  /**
   * For mad efficiency, let's take advantage of the fact that in EpiSim
   * there can only be one disease event per day for each agent;
   * add start-day and end-of-day status changes, there is a max of THREE.
   * So we can use a vec3 to push ALL infection events to all agents! Woot.
   */
  private static buildInfectionTimes(agent: Agent | Infection) {
    switch (agent.dtime.length) {
      case 0:
        return [0.0, -1.0, -1.0]
      case 1:
        return [agent.dtime[0], -1.0, -1.0]
      case 2:
        return [agent.dtime[0], agent.dtime[1], -1.0]
      case 3:
      default:
        return [agent.dtime[0], agent.dtime[1], agent.dtime[2]]
    }
  }

  private static buildInfectionTypes(agent: Agent | Infection) {
    switch (agent.d.length) {
      case 0: // nothing? assume susceptible
        return [0.0, -1.0, -1.0]
      case 1:
        return [agent.d[0], -1.0, -1.0]
      case 2:
        return [agent.d[0], agent.d[1], -1.0]
      case 3:
      default:
        return [agent.d[0], agent.d[1], agent.d[2]]
    }
  }
}

export default AgentGeometry

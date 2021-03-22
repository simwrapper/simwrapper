export enum Status {
  INFO,
  WARNING,
}

export interface SVNProject {
  name: string
  name_de: string
  url: string
  description: string
  description_de: string
  svn: string
  need_password: boolean
}

export interface VisualizationPlugin {
  component: Vue.VueConstructor
  kebabName: string
  prettyName: string
  description?: string
  filePatterns: string[]
}

export interface DirectoryEntry {
  files: string[]
  dirs: string[]
}

export interface FileSystem {
  getDirectory(path: string): Promise<DirectoryEntry>
  getFileText(path: string): Promise<string>
  getFileJson(path: string): Promise<any>
  getFileBlob(path: string): Promise<Blob | null>
  cleanURL(path: string): string
}

export enum ColorScheme {
  LightMode = 'light',
  DarkMode = 'dark',
}

export interface BreadCrumb {
  label: string
  url?: string
}

export interface ColorSet {
  text: string
  background: string
  links: string
  susceptible: string
  infectedButNotContagious: string
  contagious: string
  symptomatic: string
  seriouslyIll: string
  critical: string
  recovered: string
}

export enum Health {
  Susceptible = 'susceptible',
  InfectedButNotContagious = 'infectedButNotContagious',
  Contagious = 'contagious',
}

export interface Agent {
  id: string
  time: number[]
  path: [number, number][]
  dtime: number[]
  d: number[]
}

export interface AgentProgessingThroughDisease {
  id: string
  x: number
  y: number
  infectedButNotContagious: number
  contagious: number
  showingSymptoms: number
  seriouslySick: number
  critical: number
  recovered: number
}

export interface Infection {
  id: string
  dtime: number[]
  d: number[]
}

export interface Trip {
  id: number
  timestamps: number[]
  path?: number[]
  status?: string
}

export interface RunYaml {
  city: string
  info: string
  readme: string
  zip: string
  timestamp: string
  // these are for old version
  offset?: number[]
  startDate?: string
  endDate?: string
  // these are for new version
  defaultStartDate?: string
  startDates?: string[]
  // these are for everything
  optionGroups: {
    day?: number
    heading: string
    subheading?: string
    measures: {
      measure: string
      title: string
      order?: string
      options?: number[]
    }[]
  }[]
}

export const LIGHT_MODE: ColorSet = {
  text: '#000',
  background: '#ccccc4',
  links: '#ffffff',
  susceptible: '#999900',
  infectedButNotContagious: '#0077ff',
  contagious: '#bb0044',
  symptomatic: '#ff5533',
  seriouslyIll: '#7733ee',
  critical: '#000',
  recovered: '#116622',
}

export const DARK_MODE: ColorSet = {
  text: '#fff',
  background: '#181518',
  links: '#445577',
  susceptible: '#bbbb44',
  infectedButNotContagious: '#00dddd',
  contagious: '#ff2299',
  symptomatic: '#ff5533',
  seriouslyIll: '#7733ee',
  critical: '#fff',
  recovered: '#116622',
}

export const MAP_STYLES = {
  light: 'mapbox://styles/mapbox/light-v10',
  dark: 'mapbox://styles/vsp-tu-berlin/ckek59op0011219pbwfar1rex',
}
// dark: 'mapbox://styles/vsp-tu-berlin/ckek59op0011219pbwfar1rex',
// light 'mapbox://styles/vsp-tu-berlin/ckeetelh218ef19ob5nzw5vbh' // but still has some color
// 'mapbox://styles/mapbox/light-v9', // 'mapbox://styles/mapbox/dark-v9'

export enum LegendItemType {
  line,
  box,
}

export interface LegendItem {
  type: LegendItemType
  color: number[]
  value: any
  label?: string
}

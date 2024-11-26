class CleanupRegistry {
  private cleanupFns

  constructor() {
    this.cleanupFns = new Map()
  }

  // Register a component instance with its cleanup function
  register(component: any, cleanupFn: Function) {
    // console.log('REQUEST REGISTER', component)

    // if (!this.cleanupFns.has(component)) this.cleanupFns.set(component, new Set())

    this.cleanupFns.set(component, cleanupFn)
    // this.cleanupFns.get(key).add(component)
  }

  // Clean up a specific component instance
  cleanup(component: any) {
    console.log('calling cleanup')
    const cleanupFn = this.cleanupFns.get(component)
    if (cleanupFn) {
      cleanupFn()
      this.cleanupFns.delete(component)
    }
    console.log('Cleanup still has', Object.keys(this.cleanupFns).length)
  }

  // Clean up all instances of a component class
  cleanupAll() {
    console.log('cleaning all')
    this.cleanupFns.forEach(cleanupFn => cleanupFn())
    this.cleanupFns = new Map()
  }
}

const registry = new CleanupRegistry()
export default registry

// HMR handling -- Vite "Hot Module Reload" is not so hot.
// It LEAKS everywhere
if (import.meta.hot) {
  import.meta.hot.on('vite:beforeUpdate', () => {
    // Clean up all registered component instances before HMR update
    console.log('HMR - Wiping everything before HMR update...')
    registry.cleanupAll()
  })
}

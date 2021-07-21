import Vue from 'vue'
import VueRouter, { Route, RouteConfig } from 'vue-router'

import globalStore from '@/store'

Vue.use(VueRouter)

const routes = [
  {
    path: '/sql',
    component: () => import(/* webpackChunkName: "sql" */ '@/views/SqlThing.vue'),
  },
  {
    path: '/gist/:id',
    component: () => import(/* webpackChunkName: "gist" */ '@/views/GistView.vue'),
    props: (route: Route) => ({
      id: route.params.id,
    }),
  },
  {
    path: '/sqlite',
    component: () => import(/* webpackChunkName: "sql" */ '@/views/SqliteThing.vue'),
  },
  {
    path: '/*',
    component: () => import(/* webpackChunkName: "split" */ '@/views/ScreenSplitter.vue'),
  },
  {
    // catch-all back to home page
    path: '*',
    redirect: '/',
  },
]

function projects(): RouteConfig[] {
  const projectRoutes = [] as RouteConfig[]
  // run folder pages
  // for (const source of globalStore.state.svnProjects) {
  //   projectRoutes.push({
  //     path: '/' + source.slug + '*',
  //     name: source.slug,
  //     component: FolderBrowser,
  //     props: (route: Route) => ({
  //       root: source.slug,
  //       xsubfolder: route.path.substring(source.slug.length + 2),
  //     }),
  //   })
  // }

  return projectRoutes
}

// individual viz plugins all go into /v/* subpaths
function vizPlugins(): any[] {
  const plugins = []
  for (const plugin of globalStore.state.visualizationTypes.values()) {
    plugins.push({
      path: '/v/' + plugin.kebabName + '/:slug/*',
      name: plugin.kebabName,
      component: plugin.component,
      props: (route: Route) => {
        const match = route.params.pathMatch
        const subfolder = match.substring(0, match.lastIndexOf('/'))
        const yamlConfig = match.substring(match.lastIndexOf('/') + 1)
        return {
          root: route.params.slug,
          subfolder,
          yamlConfig,
          thumbnail: false,
        }
      },
    })
  }

  return plugins
}

const router = new VueRouter({
  mode: 'history',
  base: process.env.BASE_URL,
  routes: projects()
    .concat(vizPlugins())
    .concat(routes),
  // native-like back/forward and top-of-page routing
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    } else {
      return { x: 0, y: 0 }
    }
  },
})

export default router

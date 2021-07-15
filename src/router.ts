import Vue from 'vue'
import VueRouter, { Route, RouteConfig } from 'vue-router'
import FolderBrowser from '@/views/FolderBrowser.vue'
import DashBoard from '@/views/DashBoard.vue'

import globalStore from '@/store'

Vue.use(VueRouter)

const routes = [
  {
    path: '/sql',
    component: () => import(/* webpackChunkName: "sql" */ '@/views/SqlThing.vue'),
  },
  // {
  //   path: '/sqlite',
  //   component: () => import(/* webpackChunkName: "sql" */ '@/views/SqlThingTwo.vue'),
  // },
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
  const projectRoutes = []
  // run folder pages
  for (const source of globalStore.state.svnProjects) {
    projectRoutes.push({
      path: '/dash/' + source.slug + '*',
      name: 'dash:' + source.slug,
      component: DashBoard,
      props: (route: Route) => ({
        root: source.slug,
        xsubfolder: route.path.substring(source.slug.length + 6),
      }),
    })
    projectRoutes.push({
      path: '/' + source.slug + '*',
      name: source.slug,
      component: FolderBrowser,
      props: (route: Route) => ({
        root: source.slug,
        xsubfolder: route.path.substring(source.slug.length + 2),
      }),
    })
  }

  return projectRoutes
}

// individual viz plugins all go into /v/* subpaths
function vizPlugins(): any[] {
  const plugins = []
  for (const plugin of globalStore.state.visualizationTypes.values()) {
    plugins.push({
      path: '/v/' + plugin.kebabName + '/:project/*',
      name: plugin.kebabName,
      component: plugin.component,
      props: (route: Route) => {
        return {
          project: route.params.project,
          root: route.params.project,
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

import Vue from 'vue'
import VueRouter, { Route, RouteConfig } from 'vue-router'
import FolderBrowser from '@/views/FolderBrowser.vue'

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
  for (const source of globalStore.state.svnProjects) {
    // // project page
    // projectRoutes.push({
    //   path: '/' + source.url,
    //   name: source.url,
    //   component: FolderBrowser,
    // })
    // run folder pages
    projectRoutes.push({
      path: '/' + source.url + '*',
      name: source.url,
      component: FolderBrowser,
      props: (route: Route) => ({
        root: source.url,
        xsubfolder: route.path.substring(source.url.length + 2),
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

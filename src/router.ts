import Vue from 'vue'
import VueRouter, { Route } from 'vue-router'

import globalStore from '@/store'

Vue.use(VueRouter)

const BASE_URL = import.meta.env.BASE_URL

const routes = [
  {
    path: BASE_URL + 'embed',
    component: () => import('@/layout-manager/EmbedView.vue'),
    props: (route: Route) => ({
      root: '',
      subfolder: '',
    }),
  },
  // {
  //   path: BASE_URL + 'matrix',
  //   component: () => import('@/plugins/matrix/MatrixViewer.vue'),
  //   props: (route: Route) => ({
  //     root: '',
  //     subfolder: '',
  //   }),
  // },
  // {
  //   path: BASE_URL + 'map',
  //   component: () => import('@/plugins/layer-map/LayerMap.vue'),
  //   props: (route: Route) => ({
  //     root: '',
  //     subfolder: '',
  //   }),
  // },
  // {
  //   path: BASE_URL + 'maps',
  //   component: () => import('@/plugins/layer-map/LayerMap.vue'),
  //   props: (route: Route) => ({
  //     root: '',
  //     subfolder: '',
  //   }),
  // },
  {
    path: BASE_URL + 'runconfig/:id',
    component: () => import('@/sim-runner/RunConfigurator.vue'),
    props: (route: Route) => ({
      id: route.params.id,
    }),
  },
  {
    path: BASE_URL + '*',
    component: () => import('@/layout-manager/LayoutManager.vue'),
  },
  {
    // catch-all back to home page
    path: '*',
    redirect: BASE_URL,
  },
]

const router = new VueRouter({
  mode: 'history',
  base: '/',
  routes,
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

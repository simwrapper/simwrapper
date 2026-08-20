import { createRouter, createWebHistory, RouteLocationNormalized } from 'vue-router'

const BASE_URL = import.meta.env.BASE_URL

const routes = [
  {
    path: '/embed',
    component: () => import('@/layout-manager/EmbedView.vue'),
    props: (route: RouteLocationNormalized) => ({
      root: '',
      subfolder: '',
    }),
  },
  // {
  //   path: '/matrix',
  //   component: () => import('@/plugins/matrix/MatrixViewer.vue'),
  //   props: (route: RouteLocationNormalized) => ({ root: '', subfolder: '' }),
  // },
  // {
  //   path: '/map',
  //   component: () => import('@/plugins/layer-map/LayerMap.vue'),
  //   props: (route: RouteLocationNormalized) => ({ root: '', subfolder: '' }),
  // },
  // {
  //   path: '/maps',
  //   component: () => import('@/plugins/layer-map/LayerMap.vue'),
  //   props: (route: RouteLocationNormalized) => ({ root: '', subfolder: '' }),
  // },
  {
    path: '/runconfig/:id',
    component: () => import('@/sim-runner/RunConfigurator.vue'),
    props: (route: RouteLocationNormalized) => ({
      id: route.params.id,
    }),
  },
  {
    // catch-all: the main layout manager handles all other paths.
    // NOTE: use `(.*)` (not `(.*)*`) so `params.pathMatch` is a STRING,
    // matching vue-router 3's `path: '*'` behavior that the app relies on
    // (LeftSystemPanel/SimRunner call pathMatch.startsWith/.substring).
    path: '/:pathMatch(.*)',
    component: () => import('@/layout-manager/LayoutManager.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(BASE_URL),
  routes,
  // native-like back/forward and top-of-page routing
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    } else {
      return { left: 0, top: 0 }
    }
  },
})

export default router

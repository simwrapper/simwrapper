import { createRouter, createWebHistory } from 'vue-router'

import globalStore from '@/store'
import GistView from '@/layout-manager/GistView.vue'
import LayoutManager from '@/layout-manager/LayoutManager.vue'

const BASE_URL = import.meta.env.BASE_URL

console.log({ BASE_URL })
const routes = [
  {
    path: BASE_URL + 'gist/:id',
    component: GistView,
    props: (route: any) => ({
      id: route.params.id,
    }),
  },
  {
    path: BASE_URL,
    component: LayoutManager,
  },
  {
    // everything else goes to layoutmanager
    path: BASE_URL + ':pathMatch(.*)*',
    component: LayoutManager,
  },
]

const router = createRouter({
  history: createWebHistory('/'),
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

// router.beforeEach((to, from, next) => {
//   console.log(to.path)
//   next()
// })

export default router

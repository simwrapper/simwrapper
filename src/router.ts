import Vue from 'vue'
import VueRouter from 'vue-router'
import HomeIndex from '@/views/HomeIndex.vue'

Vue.use(VueRouter)

const routes = [
  {
    path: '/',
    name: 'Home',
    component: HomeIndex,
  },

  // {
  //   path: '/v6/:city',
  //   name: 'V6',
  //   component: () => import(/* webpackChunkName: "V6" */ '@/runs/v6/V6.vue'),
  // },

  // {
  //   path: '/*',
  //   component: () =>
  //     import(/* webpackChunkName: "runviewer" */ '@/views/battery-viewer/RunPage.vue'),
  // },

  {
    // catch-all back to home page
    path: '*',
    redirect: '/',
  },
]

const router = new VueRouter({
  mode: 'history',
  base: process.env.BASE_URL,
  routes, // native-like back/forward and top-of-page routing
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    } else {
      return { x: 0, y: 0 }
    }
  },
})

export default router

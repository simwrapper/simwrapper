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
  {
    // REDIRECT for old */covid-sim/* links
    path: '/covid-sim/*',
    redirect: '/*',
  },
  {
    path: '/v1',
    name: 'V1',
    component: () => import(/* webpackChunkName: "V1" */ '@/runs/v1/V1.vue'),
  },
  {
    path: '/v2',
    name: 'V2',
    component: () => import(/* webpackChunkName: "V2" */ '@/runs/v2/V2.vue'),
  },
  {
    path: '/v3',
    name: 'V3',
    component: () =>
      import(/* webpackChunkName: "V3" */ '@/viz/multiday-agents/MultiDayViewer.vue'),
  },
  {
    path: '/v4',
    name: 'V4',
    component: () => import(/* webpackChunkName: "V4" */ '@/runs/v4/V4.vue'),
  },
  {
    path: '/v5',
    name: 'V5',
    component: () => import(/* webpackChunkName: "V5" */ '@/runs/v5/V5.vue'),
  },
  {
    path: '/v6',
    redirect: '/v6/berlin',
  },
  {
    path: '/v6/:city',
    name: 'V6',
    component: () => import(/* webpackChunkName: "V6" */ '@/runs/v6/V6.vue'),
  },
  {
    path: '/v6/:city/:pm',
    redirect: '/v6/:city',
  },
  {
    path: '/v7',
    redirect: '/v7/berlin',
  },
  {
    path: '/v7/:city',
    name: 'V7',
    component: () => import(/* webpackChunkName: "V7" */ '@/runs/v7/V7.vue'),
  },
  {
    path: '/v7/:city/:pm',
    redirect: '/v7/:city',
  },
  {
    path: '/norun',
    name: 'norun',
    component: () => import(/* webpackChunkName: "norun" */ '@/views/MessagePage.vue'),
  },
  {
    path: '/multiday',
    component: () =>
      import(/* webpackChunkName: "multiday" */ '@/viz/multiday-agents/MultiDayViewer.vue'),
  },
  {
    path: '/timelapse',
    component: () => import(/* webpackChunkName: "multiday" */ '@/viz/time-lapse/TimeLapseViz.vue'),
  },
  {
    path: '/shader',
    redirect: '/multiday',
  },
  {
    path: '/runs/*',
    redirect: '/*',
  },
  {
    path: '/*',
    component: () =>
      import(/* webpackChunkName: "runviewer" */ '@/views/battery-viewer/RunPage.vue'),
  },
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

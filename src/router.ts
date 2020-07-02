import Vue from 'vue'
import VueRouter from 'vue-router'
import HomeIndex from '@/views/HomeIndex.vue'
import ProjectPage from '@/views/ProjectPage.vue'

import globalStore from '@/store.ts'

Vue.use(VueRouter)

const routes = [
  {
    path: '/',
    name: 'Home',
    component: HomeIndex,
  },
  {
    // catch-all back to home page
    path: '*',
    redirect: '/',
  },
]

function projects(): any[] {
  const projectRoutes = []
  for (const source of globalStore.state.svnProjects) {
    // project page
    projectRoutes.push({
      path: '/' + source.url,
      name: source.url,
      component: ProjectPage,
    })
    // run folder pages
    projectRoutes.push({
      path: '/' + source.url + '/*',
      name: source.url,
      component: ProjectPage,
    })
  }

  return projectRoutes
}

const router = new VueRouter({
  mode: 'history',
  base: process.env.BASE_URL,
  routes: projects().concat(routes), // native-like back/forward and top-of-page routing
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    } else {
      return { x: 0, y: 0 }
    }
  },
})

export default router

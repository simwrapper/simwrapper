import Vue from 'vue'
import VueRouter from 'vue-router'
import HomeIndex from '@/views/HomeIndex.vue'
import ProjectPage from '@/views/ProjectPage.vue'

import svnConfig from 'yaml-loader!@/svn-config.yml'

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
  for (const source of svnConfig.projects) {
    const namedRoute = {
      path: '/' + source.url,
      name: source.url,
      component: ProjectPage,
    }

    projectRoutes.push(namedRoute)
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

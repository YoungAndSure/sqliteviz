import { createRouter, createWebHashHistory } from 'vue-router'
import Workspace from '@/views/MainView/Workspace'
import Inquiries from '@/views/MainView/Inquiries'
import Welcome from '@/views/Welcome'
import MainView from '@/views/MainView'
import LoadView from '@/views/LoadView'
import Dashboard from '@/views/MainView/Dashboard'
import store from '@/store'
import database from '@/lib/database'
import dbPersistence from '@/lib/dbPersistence'

export const routes = [
  {
    path: '/',
    name: 'Welcome',
    component: Welcome
  },
  {
    path: '/',
    name: 'MainView',
    component: MainView,
    children: [
      {
        path: '/workspace',
        name: 'Workspace',
        component: Workspace
      },
      {
        path: '/dashboard',
        name: 'Dashboard',
        component: Dashboard
      },
      {
        path: '/inquiries',
        name: 'Inquiries',
        component: Inquiries
      }
    ]
  },
  {
    path: '/load',
    name: 'Load',
    component: LoadView
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

router.beforeEach(async (to, from, next) => {
  if (!store.state.db && to.name !== 'Load') {
    const newDb = database.getNewDatabase()
    try {
      const hasImportedData =
        typeof localStorage !== 'undefined' &&
        localStorage.getItem('hasImportedData') === '1'
      if (hasImportedData) {
        const snapshot = await dbPersistence.loadLastDb()
        if (snapshot && snapshot.buffer) {
          await newDb.loadFromArrayBuffer(snapshot.buffer, 'database')
        } else {
          await newDb.loadDb()
        }
      } else {
        await newDb.loadDb()
      }
    } catch (e) {
      console.error(e)
      await newDb.loadDb()
    }
    store.commit('setDb', newDb)
  }
  next()
})

export default router

import { createRouter, createWebHistory } from 'vue-router'
import PlannerView from '../views/PlannerView.vue'
import StudioView from '../views/StudioView.vue'
import SettingsView from '../views/SettingsView.vue'

const routes = [
  { path: '/', name: 'planner', component: PlannerView, meta: { title: '路线规划' } },
  { path: '/studio', name: 'studio', component: StudioView, meta: { title: '视频工作室' } },
  { path: '/settings', name: 'settings', component: SettingsView, meta: { title: '设置' } },
]

export default createRouter({
  history: createWebHistory(),
  routes,
})

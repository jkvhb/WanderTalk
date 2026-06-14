<script setup>
import { onMounted, watch } from 'vue'
import NavBar from './components/NavBar.vue'
import { useTripStore } from './stores/trip'
import { loadTrip, saveTrip } from './utils/db'

const trip = useTripStore()
let saveTimer = null

onMounted(async () => {
  // 启动恢复：仅在当前没有路书时恢复，避免覆盖
  try {
    const saved = await loadTrip()
    if (saved && !trip.plan) trip.replacePlan(saved)
  } catch (e) {
    console.warn('路书恢复失败：', e)
  }

  // 自动保存：深度监听 500ms 防抖；JSON 序列化剥离 Vue Proxy（IndexedDB 无法克隆 Proxy）
  watch(
    () => trip.plan,
    (val) => {
      clearTimeout(saveTimer)
      if (!val) return
      saveTimer = setTimeout(() => {
        saveTrip(JSON.parse(JSON.stringify(val))).catch((e) => console.warn('自动保存失败：', e))
      }, 500)
    },
    { deep: true },
  )
})
</script>

<template>
  <div class="flex flex-col h-full">
    <NavBar />
    <main class="flex-1 min-h-0 overflow-auto">
      <!-- 保活三视图：地图只创建一次（避免反复重建耗尽 WebGL 上下文），搜索/编辑状态切换不丢 -->
      <RouterView v-slot="{ Component }">
        <keep-alive>
          <component :is="Component" />
        </keep-alive>
      </RouterView>
    </main>
  </div>
</template>

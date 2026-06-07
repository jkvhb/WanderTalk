<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { RouterLink } from 'vue-router'
import { useSettingsStore } from '../stores/settings'
import { useTripStore } from '../stores/trip'
import { loadAmap } from '../composables/useAmap'

const settings = useSettingsStore()
const trip = useTripStore()
const mapEl = ref(null)
const error = ref('')
let map = null

onMounted(async () => {
  if (!settings.hasAmapKey) {
    error.value = '尚未配置高德 API Key'
    return
  }
  try {
    const AMap = await loadAmap(settings.amapKey)
    map = new AMap.Map(mapEl.value, {
      zoom: 6,
      center: [101.5, 30.0],
      mapStyle: 'amap://styles/normal',
    })
    map.addControl(new AMap.Scale())
    map.addControl(new AMap.ToolBar({ position: 'RB' }))
  } catch (e) {
    error.value = '地图加载失败：' + e.message
  }
})

onBeforeUnmount(() => {
  if (map) { map.destroy(); map = null }
})

function loadPreset() {
  trip.loadPreset318()
}
</script>

<template>
  <div class="flex h-full">
    <!-- 侧边栏 -->
    <aside class="w-80 shrink-0 border-r border-black/5 bg-white/60 overflow-auto p-4 space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="font-semibold">路线</h2>
        <button
          @click="loadPreset"
          class="text-xs px-2.5 py-1 rounded-md bg-accent/10 text-accent hover:bg-accent/20 transition"
        >
          加载 318 预设
        </button>
      </div>

      <div v-if="trip.plan" class="space-y-2">
        <p class="text-xs text-gray-500">{{ trip.plan.name }}</p>
        <div
          v-for="day in trip.plan.days"
          :key="day.dayNumber"
          class="rounded-lg border border-gray-100 p-2.5"
        >
          <div class="text-sm font-medium">Day {{ day.dayNumber }} · 宿{{ day.overnight }}</div>
          <div class="text-xs text-gray-400 mt-0.5">
            {{ day.waypoints.map(w => w.name).join(' → ') }}
          </div>
        </div>
      </div>
      <p v-else class="text-sm text-gray-400">点击「加载 318 预设」开始。</p>
    </aside>

    <!-- 地图 -->
    <div class="flex-1 relative">
      <div ref="mapEl" class="absolute inset-0"></div>
      <div
        v-if="error"
        class="absolute inset-0 flex flex-col items-center justify-center text-center gap-2 bg-gray-50"
      >
        <p class="text-gray-500">{{ error }}</p>
        <RouterLink to="/settings" class="text-sm text-accent">前往设置 →</RouterLink>
      </div>
    </div>
  </div>
</template>

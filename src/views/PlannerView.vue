<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useSettingsStore } from '../stores/settings'
import { useTripStore } from '../stores/trip'
import { loadAmap } from '../composables/useAmap'
import PoiSearchPanel from '../components/PoiSearchPanel.vue'

const settings = useSettingsStore()
const trip = useTripStore()
const mapEl = ref(null)
const error = ref('')
let map = null
let AMapRef = null
let overlays = [] // 当前绘制在地图上的 marker / polyline，便于清除

// 每天一种颜色，循环使用
const DAY_COLORS = [
  '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1',
]

const tab = ref('route') // 'route' | 'search'

onMounted(async () => {
  if (!settings.hasAmapKey) {
    error.value = '尚未配置高德 API Key'
    return
  }
  try {
    const AMap = await loadAmap(settings.amapKey, settings.amapSecurityCode)
    AMapRef = AMap
    map = new AMap.Map(mapEl.value, {
      zoom: 6,
      center: [101.5, 30.0],
      mapStyle: 'amap://styles/normal',
    })
    map.addControl(new AMap.Scale())
    map.addControl(new AMap.ToolBar({ position: 'RB' }))
    // 地图就绪后，如果已有路线则绘制
    if (trip.plan) drawPlan()
  } catch (e) {
    error.value = '地图加载失败：' + e.message
  }
})

onBeforeUnmount(() => {
  clearOverlays()
  if (map) { map.destroy(); map = null }
})

// 路线数据变化时重绘
watch(() => trip.plan, () => {
  if (map) drawPlan()
})

function clearOverlays() {
  if (map && overlays.length) map.remove(overlays)
  overlays = []
}

function drawPlan() {
  if (!map || !AMapRef) return
  clearOverlays()
  if (!trip.plan) return

  const AMap = AMapRef
  trip.plan.days.forEach((day, i) => {
    const color = DAY_COLORS[i % DAY_COLORS.length]
    const path = day.waypoints.map((w) => [w.lng, w.lat])

    // 当天连线（直线连接，真实驾车路径为 Phase 2）
    if (path.length > 1) {
      overlays.push(
        new AMap.Polyline({
          path,
          strokeColor: color,
          strokeWeight: 5,
          strokeOpacity: 0.85,
          lineJoin: 'round',
        }),
      )
    }

    // 途经点标记
    day.waypoints.forEach((w) => {
      overlays.push(
        new AMap.Marker({
          position: [w.lng, w.lat],
          title: `Day ${day.dayNumber} · ${w.name}`,
          anchor: 'bottom-center',
        }),
      )
    })
  })

  map.add(overlays)
  // 自动缩放到路线范围
  map.setFitView(overlays, false, [40, 40, 40, 40])
}

function loadPreset() {
  trip.loadPreset318()
}

function flyTo(poi) {
  if (!map) return
  map.setZoomAndCenter(14, [poi.lng, poi.lat])
}
</script>

<template>
  <div class="flex h-full">
    <!-- 侧边栏 -->
    <aside class="w-80 shrink-0 border-r border-black/5 bg-white/60 overflow-auto p-4 space-y-4">
      <div class="flex gap-1 bg-gray-100 rounded-lg p-1">
        <button
          @click="tab = 'route'"
          :class="['flex-1 py-1.5 rounded-md text-sm transition', tab === 'route' ? 'bg-white shadow-sm' : 'text-gray-500']"
        >路线</button>
        <button
          @click="tab = 'search'"
          :class="['flex-1 py-1.5 rounded-md text-sm transition', tab === 'search' ? 'bg-white shadow-sm' : 'text-gray-500']"
        >搜索</button>
      </div>

      <!-- 路线标签 -->
      <template v-if="tab === 'route'">
        <div class="flex items-center justify-between">
          <h2 class="font-semibold">路线</h2>
          <button
            @click="loadPreset"
            class="text-xs px-2.5 py-1 rounded-md bg-accent/10 text-accent hover:bg-accent/20 transition"
          >加载 318 预设</button>
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
      </template>

      <!-- 搜索标签 -->
      <template v-else>
        <PoiSearchPanel @select="flyTo" />
      </template>
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

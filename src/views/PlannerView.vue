<script setup>
import { ref, onMounted, onBeforeUnmount, onActivated, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useSettingsStore } from '../stores/settings'
import { useTripStore } from '../stores/trip'
import { loadAmap } from '../composables/useAmap'
import { planDrivingRoute } from '../composables/useDriving'
import { searchNearbyPoi } from '../composables/useNearby'
import { wgs84ToGcj02, wgs84PathToGcj02, gcj02ToWgs84 } from '../utils/coords'
import PoiSearchPanel from '../components/PoiSearchPanel.vue'
import DayCard from '../components/DayCard.vue'
import MapAddPopup from '../components/MapAddPopup.vue'

const settings = useSettingsStore()
const trip = useTripStore()
const mapEl = ref(null)
const error = ref('')
const calcError = ref('')
const calculating = ref(false)
const mapReady = ref(false)
let map = null
let AMapRef = null
let overlays = [] // 当前绘制在地图上的 marker / polyline，便于清除

// 每天一种颜色，循环使用
const DAY_COLORS = [
  '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1',
]

const tab = ref('route') // 'route' | 'search'
const targetDay = ref(1)

// 天数变化（删除天等）时保证 targetDay 始终有效
watch(
  () => trip.plan?.days.map((d) => d.dayNumber) ?? [],
  (nums) => {
    if (!nums.includes(targetDay.value)) targetDay.value = nums[0] ?? 1
  },
)

const addNodeMode = ref(false)
const clickLoading = ref(false)
const clickError = ref('')
const mapPopup = ref(null) // { candidate, x, y, initialDay } | null
const importFileEl = ref(null)
const importError = ref('')

// POI 坐标来自高德搜索（GCJ-02），入库前转 WGS-84
function addPoiToRoute(poi) {
  if (!trip.plan) trip.newEmptyPlan()
  const p = gcj02ToWgs84(poi.lng, poi.lat)
  trip.addWaypoint(targetDay.value, { name: poi.name, lng: p.lng, lat: p.lat, address: poi.address || '' })
}

// 浮窗定位：把像素夹到地图容器内，避免溢出
function clampPopupPos(px, py) {
  const W = mapEl.value?.clientWidth ?? 800
  const H = mapEl.value?.clientHeight ?? 600
  return {
    x: Math.max(8, Math.min(px, W - 264)),
    y: Math.max(8, Math.min(py, H - 120)),
  }
}

// 进入「点图添加」模式后点击地图：就近搜索 POI → 弹浮窗（坐标 GCJ-02 → WGS-84）
async function onMapClick(e) {
  if (!addNodeMode.value || clickLoading.value) return
  if (!trip.plan) trip.newEmptyPlan()
  clickError.value = ''
  clickLoading.value = true
  const px = e.pixel
  try {
    const poi = await searchNearbyPoi(AMapRef, e.lnglat.getLng(), e.lnglat.getLat())
    const p = gcj02ToWgs84(poi.lng, poi.lat)
    const pos = clampPopupPos(px?.getX?.() ?? px?.x ?? 16, px?.getY?.() ?? px?.y ?? 16)
    mapPopup.value = {
      candidate: { name: poi.name, address: poi.address, lng: p.lng, lat: p.lat },
      x: pos.x,
      y: pos.y,
      initialDay: targetDay.value,
    }
    addNodeMode.value = false
  } catch (err) {
    clickError.value = '获取地点失败：' + err.message
  } finally {
    clickLoading.value = false
  }
}

function onPopupConfirm({ dayNumber, index, waypoint }) {
  trip.insertWaypointAt(dayNumber, index, waypoint)
  mapPopup.value = null
}

function onPopupCancel() {
  mapPopup.value = null
}

function exportJson() {
  const blob = new Blob([trip.exportJson()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${trip.plan?.name || 'wandertalk'}-路书.json`
  a.click()
  URL.revokeObjectURL(url)
}

async function onImportFile(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  importError.value = ''
  try {
    trip.importJson(await file.text())
  } catch (err) {
    importError.value = err.message
  }
}

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
    map.on('click', onMapClick)
    map.on('complete', () => { mapReady.value = true })
    // 底图迟迟不出 → 多为高德密钥/安全码/配额/域名白名单问题；给出可见提示而非白屏
    setTimeout(() => {
      if (!mapReady.value && !error.value) {
        error.value =
          '底图加载失败或超时——多为高德配额用尽 / 安全密钥 / 域名白名单 / 网络问题。请切到「搜索」搜个地点看红字原因，或按 F12 看 Console。'
      }
    }, 10000)
    if (trip.plan) drawPlan()
  } catch (e) {
    error.value = '地图加载失败：' + e.message
  }
})

onBeforeUnmount(() => {
  clearOverlays()
  if (map) { map.destroy(); map = null }
})

// keep-alive 保活下，切回本视图时容器曾被移出文档，刷新地图尺寸避免空白/错位
onActivated(() => {
  if (map) map.resize()
})

// 路线数据（含节点编辑、segments 计算结果）变化时重绘
watch(() => trip.plan, () => {
  if (map) drawPlan()
}, { deep: true })

function clearOverlays() {
  if (map && overlays.length) map.remove(overlays)
  overlays = []
}

// 数据模型存 WGS-84；高德地图显示前转 GCJ-02
function toGcj(w) {
  const p = wgs84ToGcj02(w.lng, w.lat)
  return [p.lng, p.lat]
}

function drawPlan() {
  if (!map || !AMapRef) return
  clearOverlays()
  if (!trip.plan) return

  const AMap = AMapRef
  trip.plan.days.forEach((day, i) => {
    const color = DAY_COLORS[i % DAY_COLORS.length]

    if (day.segments?.length) {
      // 已计算的真实驾车路线
      for (const seg of day.segments) {
        overlays.push(
          new AMap.Polyline({
            path: wgs84PathToGcj02(seg.path),
            strokeColor: color,
            strokeWeight: 5,
            strokeOpacity: 0.85,
            lineJoin: 'round',
          }),
        )
      }
    } else if (day.waypoints.length > 1) {
      // 未计算路线时退化为虚线直连
      overlays.push(
        new AMap.Polyline({
          path: day.waypoints.map(toGcj),
          strokeColor: color,
          strokeWeight: 4,
          strokeOpacity: 0.5,
          strokeStyle: 'dashed',
          lineJoin: 'round',
        }),
      )
    }

    day.waypoints.forEach((w) => {
      const marker = new AMap.Marker({
        position: toGcj(w),
        title: `Day ${day.dayNumber} · ${w.name}`,
        anchor: 'bottom-center',
      })
      marker.on('click', () => {
        const info = new AMap.InfoWindow({
          content: `<div style="font-size:13px;padding:2px 4px;line-height:1.6">
            <b>${w.name}</b><br>
            Day ${day.dayNumber}${day.overnight ? ' · 宿' + day.overnight : ''}
            ${w.altitude ? '<br>海拔 ' + w.altitude + 'm' : ''}
          </div>`,
          offset: new AMap.Pixel(0, -30),
        })
        info.open(map, marker.getPosition())
      })
      overlays.push(marker)
    })
  })

  if (overlays.length) {
    map.add(overlays)
    map.setFitView(overlays, false, [40, 40, 40, 40])
  }
}

function loadPreset() {
  trip.loadPreset318()
}

// 逐天逐段计算驾车路线；已算过的天跳过；失败保留已算结果，可重试
async function calcRoutes() {
  if (!AMapRef || !trip.plan || calculating.value) return
  calculating.value = true
  calcError.value = ''
  try {
    for (const day of trip.plan.days) {
      if (day.segments?.length || day.waypoints.length < 2) continue
      const segments = []
      for (let i = 0; i < day.waypoints.length - 1; i++) {
        const from = day.waypoints[i]
        const to = day.waypoints[i + 1]
        const route = await planDrivingRoute(AMapRef, from, to)
        segments.push({ fromName: from.name, toName: to.name, ...route })
      }
      trip.setDaySegments(day.dayNumber, segments)
    }
  } catch (e) {
    calcError.value = '路线计算失败：' + e.message + '（已算好的天已保留，可重试）'
  } finally {
    calculating.value = false
  }
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

      <div v-if="trip.plan" class="flex items-center gap-2 text-xs text-gray-500">
        目标天
        <select
          v-model.number="targetDay"
          class="flex-1 px-2 py-1 rounded border border-gray-200 text-xs focus:outline-none focus:border-accent bg-white"
        >
          <option v-for="d in trip.plan.days" :key="d.dayNumber" :value="d.dayNumber">
            Day {{ d.dayNumber }}{{ d.overnight ? ' · 宿' + d.overnight : '' }}
          </option>
        </select>
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
          <button
            @click="calcRoutes"
            :disabled="calculating"
            class="w-full py-1.5 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
          >{{ calculating ? '计算中…' : '计算驾车路线' }}</button>
          <p v-if="calcError" class="text-xs text-red-500">{{ calcError }}</p>
          <DayCard
            v-for="(day, i) in trip.plan.days"
            :key="day.dayNumber"
            :day="day"
            :color="DAY_COLORS[i % DAY_COLORS.length]"
          />
          <button
            @click="trip.addDay()"
            class="w-full py-1.5 rounded-lg border border-dashed border-gray-300 text-sm text-gray-400 hover:border-accent hover:text-accent transition"
          >+ 添加一天</button>
          <div class="flex gap-2 pt-1">
            <button
              @click="exportJson"
              :disabled="!trip.plan"
              class="flex-1 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-500 hover:border-accent hover:text-accent transition disabled:opacity-40"
            >导出 JSON</button>
            <button
              @click="importFileEl.click()"
              class="flex-1 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-500 hover:border-accent hover:text-accent transition"
            >导入 JSON</button>
            <input
              ref="importFileEl"
              type="file"
              accept=".json,application/json"
              class="hidden"
              @change="onImportFile"
            />
          </div>
          <p v-if="importError" class="text-xs text-red-500">{{ importError }}</p>
        </div>
        <p v-else class="text-sm text-gray-400">点击「加载 318 预设」开始。</p>
      </template>

      <!-- 搜索标签 -->
      <template v-else>
        <PoiSearchPanel @select="flyTo" @add="addPoiToRoute" />
      </template>
    </aside>

    <!-- 地图 -->
    <div class="flex-1 relative">
      <div ref="mapEl" class="absolute inset-0"></div>
      <button
        v-if="!error"
        @click="addNodeMode = !addNodeMode"
        :class="['absolute top-3 left-3 z-10 px-3 py-1.5 rounded-lg text-xs shadow-sm transition',
                 addNodeMode ? 'bg-accent text-white' : 'bg-white/90 text-gray-600 hover:text-accent']"
      >{{ clickLoading ? '查询中…' : addNodeMode ? '点击地图选择地点…（再点取消）' : '📍 点图添加节点' }}</button>
      <p
        v-if="clickError"
        class="absolute top-14 left-3 z-10 max-w-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-500 text-xs shadow-sm"
      >{{ clickError }}</p>

      <MapAddPopup
        v-if="mapPopup"
        :candidate="mapPopup.candidate"
        :x="mapPopup.x"
        :y="mapPopup.y"
        :initial-day="mapPopup.initialDay"
        @confirm="onPopupConfirm"
        @cancel="onPopupCancel"
      />

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

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useFlightStore } from '../stores/flight'
import { useSettingsStore } from '../stores/settings'
import { createFlightMap } from '../composables/useMapLibre'
import { getImage } from '../utils/db'

const emit = defineEmits(['close'])
const flight = useFlightStore()
const settings = useSettingsStore()

const mapEl = ref(null)
const state = ref('loading') // loading | no-key | error | ready
const mapError = ref('')
let mapAdapter = null
let audioEl = null

const sample = computed(() => flight.sample)
const overlay = computed(() => sample.value?.overlay)
const altitude = computed(() => sample.value?.altitude)
// 海拔 HUD 只在旅行段显示（到站后展示页自带海拔徽标，避免重复）
const showAltitude = computed(() => altitude.value != null && sample.value?.phase === 'fly')

const stageEl = ref(null)

// 当前展示页对应的节点（取名/地址/备注）
const activeNode = computed(() => {
  const i = showcase.value?.stopIndex
  if (i == null || i < 0) return null
  return flight.timeline?.stops?.[i]?.node ?? null
})

function fmt(sec) {
  if (!Number.isFinite(sec)) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// —— 圆形揭幕：圆心=到站点在当前相机下的屏幕投影，最大半径=舞台对角线 ——
// 注意：必须声明在下方 imgUrls watch 之前——watch 创建时会同步执行 getter，
// 其 getter 引用 showcase，若 showcase 声明在后面会触发 TDZ 报错（4b 踩过的坑）。
const showcase = computed(() => sample.value?.showcase ?? null)
const wipeOrigin = ref({ x: 0, y: 0, maxR: 0 })

function updateWipeOrigin() {
  const stage = stageEl.value?.getBoundingClientRect()
  const i = showcase.value?.stopIndex
  if (!stage || i == null || i < 0 || !mapAdapter?.project) return false
  const stop = flight.timeline?.stops?.[i]
  if (!stop) return false
  // 圆心锚路线终点（驾车路线吸附道路）；首节点无路线退回节点坐标
  const route = stop.routeToHere
  const lngLat = route?.length ? route[route.length - 1] : [stop.node.lng, stop.node.lat]
  const pt = mapAdapter.project(lngLat)
  if (!pt) return false
  wipeOrigin.value = { x: pt.x, y: pt.y, maxR: Math.hypot(stage.width, stage.height) }
  return true
}
// 地图未建成（懒建图竞态）时单次计算会失败——有限重试，否则首个 dwell 的展示页
// 会被 circle(0) 整段裁没且无自愈时机
let originRetryId = 0
function tryUpdateWipeOrigin(retries = 10) {
  if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(originRetryId)
  if (updateWipeOrigin() || retries <= 0) return
  if (typeof requestAnimationFrame !== 'undefined') {
    originRetryId = requestAnimationFrame(() => tryUpdateWipeOrigin(retries - 1))
  }
}
// 两个时机重算圆心：进入新 dwell（扩圆）；相机暗中换场后（收圆要朝新总览里的同一节点收拢）。
// 同步立即算——store 在同一 tick 已 jumpTo 完毕，而 stage/map 都不依赖展示页 div 挂载；
// 等 nextTick 反而给"seek 进揭幕边缘"留出一帧错圆心
watch(
  () => [showcase.value?.stopIndex, sample.value?.camera?.sceneId],
  () => tryUpdateWipeOrigin(),
)

const wipeStyle = computed(() => {
  const sc = showcase.value
  if (!sc) return null
  const { x, y, maxR } = wipeOrigin.value
  const r = Math.max(0, sc.revealFrac) * (maxR || 0)
  return { clipPath: `circle(${r.toFixed(1)}px at ${x}px ${y}px)` }
})

// 旁白正文剥掉 SSML 标签后展示（<break/> <emphasis> 等来自 Phase 3 文案）
const plainNarration = computed(() => (activeNode.value?.narration || '').replace(/<[^>]+>/g, '').trim())

// —— 图片轮播：展示页切换节点时加载该节点图片 Blob → objectURL ——
const imgUrls = ref([])
function revokeImgs() {
  imgUrls.value.forEach((u) => URL.revokeObjectURL(u))
  imgUrls.value = []
}
watch(
  () => showcase.value?.stopIndex,
  async (idx) => {
    revokeImgs()
    if (idx == null || idx < 0) return
    const ids = flight.timeline?.stops?.[idx]?.node?.images || []
    const urls = []
    for (const id of ids) {
      const e = await getImage(id)
      if (e?.blob) urls.push(URL.createObjectURL(e.blob))
    }
    imgUrls.value = urls
  },
)
const currentImg = computed(() => imgUrls.value[showcase.value?.imageIndex ?? 0] || null)

function stopAudioEl() {
  if (audioEl) {
    try {
      audioEl.pause()
    } catch {
      /* 忽略 */
    }
    audioEl = null
  }
}

function buildAdapter() {
  return {
    setCamera: (cam) => mapAdapter?.setCamera(cam),
    setCar: (car) => mapAdapter?.setCar?.(car),
    setProgress: (p) => mapAdapter?.setProgress?.(p),
    playAudio: (blob, offset) => {
      stopAudioEl()
      audioEl = new Audio(URL.createObjectURL(blob))
      audioEl.currentTime = offset || 0
      audioEl.play().catch(() => {})
    },
    stopAudio: stopAudioEl,
  }
}

onMounted(async () => {
  if (!settings.tiandituKey) {
    state.value = 'no-key'
    return
  }
  const ok = await flight.buildFromPlan()
  if (!ok) {
    state.value = 'error'
    return
  }
  // 初始相机 = 首节点
  const first = flight.timeline.stops[0].node
  mapAdapter = createFlightMap({
    container: mapEl.value,
    tk: settings.tiandituKey,
    center: [first.lng, first.lat],
    onError: (m) => {
      mapError.value = m
    },
  })
  // 画全程路线：不过滤，leg 下标须与 stops 下标对齐（adapter 自行处理 null/短段）
  mapAdapter.drawRoute(flight.timeline.stops.map((s) => s.routeToHere))
  flight.attach(buildAdapter())
  flight.seek(0)
  window.addEventListener('resize', updateWipeOrigin)
  state.value = 'ready'
})

onBeforeUnmount(() => {
  if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(originRetryId)
  window.removeEventListener('resize', updateWipeOrigin)
  flight.pause()
  flight.detach()
  stopAudioEl()
  revokeImgs()
  mapAdapter?.destroy()
})

function toggle() {
  flight.playing ? flight.pause() : flight.play()
}
</script>

<template>
  <div class="absolute inset-0 flex flex-col bg-black">
    <!-- 顶栏 -->
    <div class="flex items-center justify-between px-3 py-2 text-white/80 text-sm bg-black/40">
      <span>飞行动画预览</span>
      <button class="px-2 py-0.5 rounded hover:bg-white/10" @click="emit('close')">✕ 关闭</button>
    </div>

    <!-- 预览舞台：铺满预览区，给 MapLibre 一个确定尺寸的定位容器（精确 16:9 画幅留待导出阶段）-->
    <div class="flex-1 relative overflow-hidden" ref="stageEl">
        <!-- 注意：不能用 absolute inset-0——maplibre-gl.css 的 .maplibregl-map{position:relative}
             会盖掉 Tailwind 的 absolute，令 inset-0 失效、容器塌成 0 高。用 w-full h-full 铺满父级。-->
        <div ref="mapEl" class="w-full h-full"></div>

        <!-- 瓦片错误提示 -->
        <p v-if="mapError" class="absolute top-2 left-2 right-2 text-xs text-red-200 bg-red-900/60 rounded px-2 py-1">
          {{ mapError }}
        </p>

        <!-- 状态：无 key / 错误 -->
        <div v-if="state === 'no-key'" class="absolute inset-0 flex items-center justify-center text-center text-white/80 p-6">
          <div>
            <p class="mb-2">尚未配置天地图 key。</p>
            <RouterLink to="/settings" class="text-accent underline">前往「设置」填写 →</RouterLink>
          </div>
        </div>
        <div v-else-if="state === 'error'" class="absolute inset-0 flex items-center justify-center text-center text-white/80 p-6">
          <div>
            <p class="mb-2">{{ flight.error }}</p>
            <ul v-if="flight.needsSynth.length" class="text-xs text-white/60">
              <li v-for="n in flight.needsSynth" :key="n">· {{ n }}</li>
            </ul>
          </div>
        </div>

        <!-- 片头/片尾叠加层 -->
        <div
          v-if="overlay?.kind === 'intro'"
          class="absolute inset-0 flex flex-col items-center justify-center bg-black/35 text-white text-center px-8"
        >
          <h2 class="text-3xl font-bold drop-shadow">{{ overlay.title }}</h2>
          <p v-if="overlay.subtitle" class="mt-2 text-white/80">{{ overlay.subtitle }}</p>
        </div>
        <div
          v-else-if="overlay?.kind === 'outro'"
          class="absolute inset-0 flex flex-col items-center justify-center bg-black/45 text-white text-center gap-1"
        >
          <p v-for="(l, i) in overlay.lines" :key="i" :class="i === 0 ? 'text-2xl font-bold' : 'text-white/80'">{{ l }}</p>
        </div>

        <!-- 海拔 HUD -->
        <div v-if="showAltitude" class="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-black/50 text-white text-sm">
          海拔 <span class="font-semibold">{{ altitude }}</span> m
        </div>

        <!-- 节点展示页：圆形揭幕（clip-path 由 revealFrac 逐帧驱动，圆心=到站点投影） -->
        <div v-if="showcase && wipeStyle" class="absolute inset-0 bg-black overflow-hidden" :style="wipeStyle">
          <img v-if="currentImg" :src="currentImg" class="absolute inset-0 w-full h-full object-cover" alt="" />
          <div class="absolute inset-0 bg-black/40"></div>

          <div class="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/50 text-white/90 text-xs">
            <span class="w-2 h-2 rounded-full bg-teal-300"></span>
            正在讲解 · 第 {{ (showcase.stopIndex ?? 0) + 1 }}/{{ flight.timeline?.stops?.length || 0 }} 站
          </div>

          <div v-if="activeNode" class="absolute left-8 bottom-16 right-40 text-white">
            <div class="flex items-baseline gap-3 flex-wrap">
              <h2 class="text-3xl font-bold drop-shadow">{{ activeNode.name }}</h2>
              <span v-if="activeNode.altitude != null" class="px-3 py-1 rounded-full bg-teal-700/90 text-teal-50 text-sm">
                海拔 {{ activeNode.altitude }} m
              </span>
            </div>
            <p v-if="activeNode.address" class="mt-1 text-sm text-white/70">{{ activeNode.address }}</p>
            <p v-if="activeNode.note" class="mt-2 text-[15px] text-white/90 max-w-2xl">{{ activeNode.note }}</p>
            <p
              v-if="plainNarration"
              class="mt-3 text-sm text-white/80 max-w-3xl"
              style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden"
            >{{ plainNarration }}</p>
          </div>

          <div v-if="imgUrls.length > 1" class="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-2">
            <div
              v-for="(u, idx) in imgUrls"
              :key="u"
              class="w-20 h-14 rounded-md overflow-hidden border-2"
              :class="idx === (showcase.imageIndex ?? 0) ? 'border-teal-300' : 'border-white/25'"
            >
              <img :src="u" class="w-full h-full object-cover" alt="" />
            </div>
          </div>
        </div>

        <!-- 控件条 -->
        <div v-if="state === 'ready'" class="absolute left-0 right-0 bottom-0 flex items-center gap-3 px-4 py-2 bg-black/50 text-white">
          <button class="w-8 text-lg" @click="toggle">{{ flight.playing ? '⏸' : '▶' }}</button>
          <input
            type="range"
            class="flex-1"
            min="0"
            :max="flight.totalDuration"
            step="0.1"
            :value="flight.t"
            @input="flight.seek(Number($event.target.value))"
          />
          <span class="text-xs tabular-nums">{{ fmt(flight.t) }} / {{ fmt(flight.totalDuration) }}</span>
          <select
            :value="flight.speed"
            @change="flight.setSpeed(Number($event.target.value))"
            class="bg-transparent border border-white/30 rounded text-xs px-1 py-0.5"
          >
            <option class="text-black" :value="0.5">0.5x</option>
            <option class="text-black" :value="1">1x</option>
            <option class="text-black" :value="1.5">1.5x</option>
            <option class="text-black" :value="2">2x</option>
          </select>
        </div>
    </div>
  </div>
</template>

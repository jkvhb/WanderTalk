<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
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
const card = computed(() => sample.value?.card)
const overlay = computed(() => sample.value?.overlay)
const altitude = computed(() => sample.value?.altitude)
const showAltitude = computed(
  () => altitude.value != null && ['fly', 'dwell'].includes(sample.value?.phase),
)

// 当前卡片对应的节点（取名/地址/备注）
const activeNode = computed(() => {
  const i = card.value?.stopIndex
  if (i == null || i < 0) return null
  return flight.timeline?.stops?.[i]?.node ?? null
})

// —— 节点特写锚点：dwell 时把节点经纬度投到舞台像素，画引线 + 脉冲标记 ——
const stageEl = ref(null)
const panelEl = ref(null)
const anchor = ref(null) // { x1,y1 面板右缘中点, x2,y2 节点 } 舞台内像素

function updateAnchor() {
  const node = activeNode.value
  const stage = stageEl.value?.getBoundingClientRect()
  if (!node || !card.value?.visible || !mapAdapter?.project || !stage) {
    anchor.value = null
    return
  }
  // map.project 返回相对地图画布的 CSS 像素；mapEl 以 w-full h-full 与舞台完全重合、无偏移，
  // 所以投影坐标可直接当舞台内 left/top 用。布局若改动需重审这一假设。
  const pt = mapAdapter.project([node.lng, node.lat])
  const panel = panelEl.value?.getBoundingClientRect()
  if (!pt || !panel) {
    anchor.value = null // 面板未挂载时宁可不画，也不画一条端点错误的线
    return
  }
  anchor.value = {
    x2: pt.x,
    y2: pt.y,
    x1: panel.right - stage.left,
    y1: panel.top + panel.height / 2 - stage.top,
  }
}

function fmt(sec) {
  if (!Number.isFinite(sec)) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// —— 图片轮播：卡片切换节点时加载该节点图片 Blob → objectURL ——
const imgUrls = ref([])
function revokeImgs() {
  imgUrls.value.forEach((u) => URL.revokeObjectURL(u))
  imgUrls.value = []
}
watch(
  () => card.value?.stopIndex,
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
const currentImg = computed(() => imgUrls.value[card.value?.imageIndex ?? 0] || null)

// dwell 相机静止：进入/切换停留时算一次即可；窗口尺寸变了再算。
// 注意：必须声明在 imgUrls 之后——watch 创建时会同步执行 getter，提前引用会触发 TDZ 报错。
watch(
  () => [sample.value?.phase, card.value?.stopIndex, imgUrls.value.length],
  async () => {
    await nextTick()
    updateAnchor()
  },
)

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
  // 画全程路线
  mapAdapter.drawRoute(flight.timeline.stops.map((s) => s.routeToHere).filter((p) => p.length > 1))
  flight.attach(buildAdapter())
  flight.seek(0)
  window.addEventListener('resize', updateAnchor)
  state.value = 'ready'
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateAnchor)
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

        <!-- 引线：照片面板右缘中点 → 节点（写实底图上的轻量叠加）-->
        <svg v-if="anchor" class="absolute inset-0 w-full h-full pointer-events-none">
          <line :x1="anchor.x1" :y1="anchor.y1" :x2="anchor.x2" :y2="anchor.y2"
            stroke="white" stroke-opacity="0.55" stroke-width="1.5" />
          <circle :cx="anchor.x1" :cy="anchor.y1" r="3" fill="white" fill-opacity="0.7" />
        </svg>

        <!-- 节点脉冲标记 -->
        <div v-if="anchor" :style="{ left: anchor.x2 + 'px', top: anchor.y2 + 'px', transform: 'translate(-50%, -50%)' }"
          class="absolute pointer-events-none">
          <span class="absolute -left-2.5 -top-2.5 w-5 h-5 rounded-full bg-teal-300/50 animate-ping"></span>
          <span class="relative block w-2.5 h-2.5 rounded-full bg-teal-200 ring-2 ring-white/80"></span>
        </div>

        <!-- 左侧照片面板：实景照片（Ken Burns）+ 节点名/海拔/地址/备注 -->
        <div
          v-if="card?.visible && activeNode"
          ref="panelEl"
          class="absolute left-4 top-1/2 -translate-y-1/2 w-[30%] max-w-sm rounded-xl overflow-hidden bg-black/55 text-white shadow-lg backdrop-blur-sm"
        >
          <div v-if="currentImg" class="relative h-44 overflow-hidden">
            <img
              :key="card.stopIndex + '-' + card.imageIndex"
              :src="currentImg"
              class="w-full h-full object-cover kb-img"
              alt=""
            />
          </div>
          <div class="p-3">
            <div class="flex items-baseline gap-2">
              <h3 class="text-lg font-semibold">{{ activeNode.name }}</h3>
              <span v-if="activeNode.altitude != null" class="text-xs text-white/70">{{ activeNode.altitude }} m</span>
            </div>
            <p v-if="activeNode.address" class="text-xs text-white/70 mt-0.5">{{ activeNode.address }}</p>
            <p v-if="activeNode.note" class="text-sm text-white/90 mt-1">{{ activeNode.note }}</p>
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

<style scoped>
@keyframes kenburns {
  from { transform: scale(1) translate(0, 0); }
  to { transform: scale(1.12) translate(-2%, -2%); }
}
.kb-img { animation: kenburns 6s ease-out forwards; }
</style>

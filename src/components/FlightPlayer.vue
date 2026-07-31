<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useFlightStore } from '../stores/flight'
import { useSettingsStore } from '../stores/settings'
import { createFlightMap } from '../composables/useMapLibre'
import { getImage } from '../utils/db'
import { normalizeShowcaseStory } from '../utils/showcaseStory'
import { resolveMapShowcaseLayout } from '../utils/mapShowcaseLayout'
import {
  canCommitShowcaseLayout,
  shouldResolveShowcaseLayout,
  isShowcaseLayoutVisible,
} from '../utils/showcasePresentation'
import MapNodeShowcase from './MapNodeShowcase.vue'

const emit = defineEmits(['close'])
const flight = useFlightStore()
const settings = useSettingsStore()

const mapEl = ref(null)
const stageEl = ref(null)
const state = ref('loading')
const mapError = ref('')
let mapAdapter = null
let audioEl = null
let audioUrl = ''

const sample = computed(() => flight.sample)
const overlay = computed(() => sample.value?.overlay)
const showcase = computed(() => sample.value?.showcase ?? null)
const altitude = computed(() => sample.value?.altitude)
const showAltitude = computed(() => altitude.value != null && sample.value?.phase === 'fly')
const activeNode = computed(() => {
  const index = showcase.value?.stopIndex
  if (index == null || index < 0) return null
  return flight.timeline?.stops?.[index]?.node ?? null
})

function fmt(sec) {
  if (!Number.isFinite(sec)) return '0:00'
  const minutes = Math.floor(sec / 60)
  const seconds = Math.floor(sec % 60)
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

const imgUrls = ref([])
const imagesReady = ref(false)
let imageLoadToken = 0
function revokeImgs() {
  imgUrls.value.forEach((url) => URL.revokeObjectURL(url))
  imgUrls.value = []
}
watch(
  () => showcase.value?.stopIndex,
  async (index) => {
    const token = ++imageLoadToken
    imagesReady.value = false
    revokeImgs()
    if (index == null || index < 0) {
      imagesReady.value = true
      return
    }
    const ids = flight.timeline?.stops?.[index]?.node?.images || []
    const urls = []
    for (const id of ids) {
      const entry = await getImage(id)
      if (entry?.blob) urls.push(URL.createObjectURL(entry.blob))
    }
    if (token !== imageLoadToken) {
      urls.forEach((url) => URL.revokeObjectURL(url))
      return
    }
    imgUrls.value = urls
    imagesReady.value = true
    if (shouldResolveShowcaseLayout({
      enterFrac: showcase.value?.enterFrac,
      stopIndex: showcase.value?.stopIndex,
      layoutReadyStop: layoutReadyStop.value,
      imagesReady: imagesReady.value,
    })) scheduleLayout()
  },
)

const prefersReducedMotion = ref(false)
let reducedMotionMedia = null
function syncReducedMotion(event) {
  prefersReducedMotion.value = !!event?.matches
}

function mapOnlyLayout() {
  return {
    presetId: 'map-only',
    panel: null,
    slots: [],
    identity: { xPct: 4, yPct: 6, align: 'left' },
    mapTarget: { xPct: 50, yPct: 50 },
    imageOrder: [],
    beats: [],
  }
}

const compiledLayout = ref(mapOnlyLayout())
const layoutByStop = new Map()
const presetCounts = {}
let layoutRetryId = 0
const layoutReadyStop = ref(-1)

function sampledRoutePoints(stopIndex) {
  const stops = flight.timeline?.stops || []
  const paths = [stops[stopIndex]?.routeToHere, stops[stopIndex + 1]?.routeToHere]
  const points = []
  for (const path of paths) {
    if (!Array.isArray(path) || path.length === 0) continue
    const step = Math.max(1, Math.ceil(path.length / 80))
    for (let index = 0; index < path.length; index += step) points.push(path[index])
    points.push(path[path.length - 1])
  }
  return points
}

function recomputeLayout() {
  if (!canCommitShowcaseLayout({
    enterFrac: showcase.value?.enterFrac,
    stopIndex: showcase.value?.stopIndex,
    layoutReadyStop: layoutReadyStop.value,
    imagesReady: imagesReady.value,
    cameraSettled: mapAdapter?.isCameraSettled?.() === true,
  })) return false
  const stage = stageEl.value?.getBoundingClientRect()
  const stopIndex = showcase.value?.stopIndex
  const node = activeNode.value
  if (!stage || !(stage.width > 0) || !(stage.height > 0) || stopIndex == null || !node || !mapAdapter?.project) {
    return false
  }
  const nodePoint = mapAdapter.project([node.lng, node.lat])
  if (!nodePoint) return false
  const routePoints = sampledRoutePoints(stopIndex)
    .map((point) => mapAdapter.project(point))
    .filter(Boolean)
  const story = normalizeShowcaseStory(node.choreography?.config, imgUrls.value.length)
  const previousPreset = layoutByStop.get(stopIndex - 1)?.presetId
  const result = resolveMapShowcaseLayout({
    story,
    imageCount: imgUrls.value.length,
    viewport: { width: stage.width, height: stage.height },
    nodePoint,
    routePoints,
    recentPresetIds: previousPreset ? [previousPreset] : [],
    dayPresetCounts: presetCounts,
  })
  const prior = layoutByStop.get(stopIndex)
  if (prior?.presetId && prior.presetId !== result.presetId) {
    presetCounts[prior.presetId] = Math.max(0, (presetCounts[prior.presetId] || 1) - 1)
  }
  if (!prior || prior.presetId !== result.presetId) {
    presetCounts[result.presetId] = (presetCounts[result.presetId] || 0) + 1
  }
  layoutByStop.set(stopIndex, result)
  compiledLayout.value = result
  layoutReadyStop.value = stopIndex
  return true
}

// 手动跳转可能在节点镜头刚开始移动时就到达 enterFrac=1；最多等约 4 秒，
// 以地图引擎实际停止为准，而不是再次猜测一个时间轴百分比。
function scheduleLayout(retries = 240) {
  if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(layoutRetryId)
  if (recomputeLayout() || retries <= 0) return
  if (typeof requestAnimationFrame !== 'undefined') {
    layoutRetryId = requestAnimationFrame(() => scheduleLayout(retries - 1))
  }
}

watch(
  () => showcase.value?.stopIndex,
  (stopIndex) => {
    layoutReadyStop.value = -1
    compiledLayout.value = mapOnlyLayout()
    if (shouldResolveShowcaseLayout({
      enterFrac: showcase.value?.enterFrac,
      stopIndex,
      layoutReadyStop: layoutReadyStop.value,
      imagesReady: imagesReady.value,
    })) scheduleLayout()
  },
)
watch(
  () => showcase.value?.enterFrac,
  (frac) => {
    const stopIndex = showcase.value?.stopIndex
    if (shouldResolveShowcaseLayout({
      enterFrac: frac,
      stopIndex,
      layoutReadyStop: layoutReadyStop.value,
      imagesReady: imagesReady.value,
    })) scheduleLayout()
  },
)

function stopAudioEl() {
  if (audioEl) {
    try {
      audioEl.pause()
    } catch {
      // 浏览器可能已自动释放音频。
    }
    audioEl = null
  }
  if (audioUrl) {
    URL.revokeObjectURL(audioUrl)
    audioUrl = ''
  }
}

function buildAdapter() {
  return {
    setCamera: (camera) => mapAdapter?.setCamera(camera),
    setCar: (car) => mapAdapter?.setCar?.(car),
    setProgress: (progress) => mapAdapter?.setProgress?.(progress),
    playAudio: (blob, offset) => {
      stopAudioEl()
      audioUrl = URL.createObjectURL(blob)
      audioEl = new Audio(audioUrl)
      audioEl.playbackRate = flight.speed
      audioEl.currentTime = offset || 0
      audioEl.play().catch(() => {})
    },
    setPlaybackRate: (rate) => {
      if (audioEl) audioEl.playbackRate = rate
    },
    stopAudio: stopAudioEl,
  }
}

onMounted(async () => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    reducedMotionMedia = window.matchMedia('(prefers-reduced-motion: reduce)')
    syncReducedMotion(reducedMotionMedia)
    reducedMotionMedia.addEventListener?.('change', syncReducedMotion)
    reducedMotionMedia.addListener?.(syncReducedMotion)
  }
  if (!settings.tiandituKey) {
    state.value = 'no-key'
    return
  }
  const ok = await flight.buildFromPlan()
  if (!ok) {
    state.value = 'error'
    return
  }
  const first = flight.timeline.stops[0].node
  mapAdapter = createFlightMap({
    container: mapEl.value,
    tk: settings.tiandituKey,
    center: [first.lng, first.lat],
    onError: (message) => {
      mapError.value = message
    },
  })
  mapAdapter.drawRoute(flight.timeline.stops.map((stop) => stop.routeToHere))
  flight.attach(buildAdapter())
  flight.seek(0)
  window.addEventListener('resize', scheduleLayout)
  state.value = 'ready'
})

onBeforeUnmount(() => {
  if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(layoutRetryId)
  window.removeEventListener('resize', scheduleLayout)
  reducedMotionMedia?.removeEventListener?.('change', syncReducedMotion)
  reducedMotionMedia?.removeListener?.(syncReducedMotion)
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
    <div class="flex items-center justify-between px-3 py-2 text-white/80 text-sm bg-black/40">
      <span>飞行动画预览</span>
      <button class="px-2 py-0.5 rounded hover:bg-white/10" @click="emit('close')">✕ 关闭</button>
    </div>

    <div ref="stageEl" class="flex-1 relative overflow-hidden">
      <div ref="mapEl" class="w-full h-full"></div>

      <p v-if="mapError" class="absolute top-2 left-2 right-2 text-xs text-red-200 bg-red-900/60 rounded px-2 py-1">
        {{ mapError }}
      </p>

      <div v-if="state === 'no-key'" class="absolute inset-0 flex items-center justify-center text-center text-white/80">
        <div>
          <p class="mb-2">缺少天地图 Key</p>
          <RouterLink to="/settings" class="text-teal-300 underline">前往设置</RouterLink>
        </div>
      </div>
      <div v-else-if="state === 'error'" class="absolute inset-0 flex items-center justify-center text-center text-white/80 p-6">
        <div>
          <p class="mb-2">{{ flight.error }}</p>
          <ul v-if="flight.needsSynth.length" class="text-xs text-white/60">
            <li v-for="name in flight.needsSynth" :key="name">{{ name }}</li>
          </ul>
        </div>
      </div>

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
        <p v-for="(line, index) in overlay.lines" :key="index" :class="index === 0 ? 'text-2xl font-bold' : 'text-white/80'">
          {{ line }}
        </p>
      </div>

      <div v-if="showAltitude" class="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-black/50 text-white text-sm">
        海拔 <span class="font-semibold">{{ altitude }}</span> m
      </div>

      <MapNodeShowcase
        v-if="showcase && isShowcaseLayoutVisible(showcase.stopIndex, layoutReadyStop)"
        :node="activeNode"
        :images="imgUrls"
        :layout="compiledLayout"
        :enter-frac="showcase.enterFrac"
        :narration-frac="showcase.narrationFrac"
        :exit-frac="showcase.exitFrac"
        :stop-index="showcase.stopIndex"
        :stop-count="flight.timeline?.stops?.length || 0"
        :reduced-motion="prefersReducedMotion"
      />

      <div v-if="state === 'ready'" class="absolute z-30 left-0 right-0 bottom-0 flex items-center gap-3 px-4 py-2 bg-black/50 text-white">
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
          class="bg-transparent border border-white/30 rounded text-xs px-1 py-0.5"
          @change="flight.setSpeed(Number($event.target.value))"
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

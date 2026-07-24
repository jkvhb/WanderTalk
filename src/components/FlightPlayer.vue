<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useFlightStore } from '../stores/flight'
import { useSettingsStore } from '../stores/settings'
import { createFlightMap } from '../composables/useMapLibre'
import { getImage } from '../utils/db'
import { compileChoreography } from '../utils/choreography'
import { hashString } from '../utils/rand'
import { compileShowcaseTransition } from '../utils/showcaseTransition'

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

// ??????????????????????????????????
// ????????? idle ???????????????????
const tilesReadyForReveal = ref(true)
const holdClosingReveal = ref(false)
let tileReadyToken = 0
watch(
  () => showcase.value?.stopIndex,
  async (stopIndex) => {
    const token = ++tileReadyToken
    holdClosingReveal.value = false
    tilesReadyForReveal.value = stopIndex == null
    if (stopIndex == null) return
    await mapAdapter?.waitForTiles?.({ timeoutMs: 2500 })
    if (token === tileReadyToken) {
      tilesReadyForReveal.value = true
      holdClosingReveal.value = false
    }
  },
)
watch(
  () => showcase.value?.revealFrac,
  (next, previous) => {
    if (next == null || previous == null) return
    if (previous >= 0.999 && next < 0.999 && !tilesReadyForReveal.value) holdClosingReveal.value = true
  },
)


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
  tileReadyToken++
  if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(originRetryId)
  if (updateWipeOrigin() || retries <= 0) return
  if (typeof requestAnimationFrame !== 'undefined') {
    originRetryId = requestAnimationFrame(() => tryUpdateWipeOrigin(retries - 1))
  }
}
// 进入新 dwell 时重算圆心（相机整段不动，无需二次重算）。
// 同步立即算——store 在同一 tick 已应用相机，而 stage/map 都不依赖展示页 div 挂载；
// 等 nextTick 反而给"seek 进揭幕边缘"留出一帧错圆心
watch(
  () => showcase.value?.stopIndex,
  () => tryUpdateWipeOrigin(),
)


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

const prefersReducedMotion = ref(false)
let reducedMotionMedia = null
function syncReducedMotion(event) {
  prefersReducedMotion.value = !!event?.matches
}
// —— Phase 4e：编排动效（LLM 配参 + 词汇表编译，全部 transform/opacity，卡片 pointer-events:none）——
// computed 按 activeNode 缓存 = 每站只编译一次；seed 取 narrationHash（生成时的旁白哈希，
// 十六进制）保证与配置同源，缺失则退回现场旁白哈希——确定性：同节点每次播放动效一致
const compiledChoreo = computed(() => {
  const node = activeNode.value
  const cfg = node?.choreography?.config
  if (!cfg) return null
  // imageCount 取已加载成功的 objectURL 数（而非 node.images 长度）：
  // 加载中/个别 Blob 缺失时自动回落，绝不渲染空白卡片
  const imageCount = imgUrls.value.length
  const hex = node.choreography.narrationHash
  const seed = hex ? parseInt(hex, 16) >>> 0 : hashString(node.narration || '')
  return compileChoreography(cfg, { imageCount, seed })
})
const showcaseLayout = computed(() => compiledChoreo.value?.transition?.layout ?? 'hero-image')
const textFirstImageVisible = computed(() =>
  showcaseLayout.value === 'text-first' && !!currentImg.value && (showcase.value?.narrationFrac ?? 0) >= 0.55,
)
const forwardDirection = computed(() => {
  const stopIndex = showcase.value?.stopIndex
  const route = stopIndex == null ? null : flight.timeline?.stops?.[stopIndex + 1]?.routeToHere
  if (!route || route.length < 2) return 'left'
  const start = route[0]
  const end = route[route.length - 1]
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left'
  return dy >= 0 ? 'up' : 'down'
})
const showcaseTransition = computed(() => {  const sc = showcase.value
  if (!sc) return { kind: 'route-bloom', style: {} }
  return compileShowcaseTransition({
    transition: compiledChoreo.value?.transition ?? {
      enter: 'route-bloom', anchor: 'route-end', direction: 'forward',
      energy: 'medium', layout: 'scattered-cards', exit: 'return-map',
    },
    revealFrac: holdClosingReveal.value ? 1 : sc.revealFrac,
    origin: wipeOrigin.value,
    forwardDirection: forwardDirection.value,
    closing: sc.closing,
    reducedMotion: prefersReducedMotion.value,
  })
})

// 卡片模式：有配置且 ≥2 张图已加载完（异步加载中先回落全屏铺底，不闪半空卡）
const cardMode = computed(() =>
  compiledChoreo.value?.mode === 'cards' && ['scattered-cards', 'sequential-cards'].includes(showcaseLayout.value),
)
// 1 张图 + 有配置：全屏铺底叠加微呼吸（≤2%）
const fullbleedBreathe = computed(() =>
  compiledChoreo.value?.mode === 'fullbleed' ? compiledChoreo.value.breathe : null,
)
const fullbleedStyle = computed(() => {
  const b = fullbleedBreathe.value
  if (!b) return null
  return { '--breathe-amp': (1 + b.amp).toFixed(4), '--breathe-period': b.periodS.toFixed(2) + 's' }
})

// 相位表 → 当前相位：narrationFrac 对照 at（取最后一个 at ≤ frac 的相位）
const phaseIndex = computed(() => {
  const c = compiledChoreo.value
  if (!c || c.mode !== 'cards' || !c.phases?.length) return -1
  const frac = showcase.value?.narrationFrac ?? 0
  let idx = 0
  for (let k = 0; k < c.phases.length; k++) {
    if (frac >= c.phases[k].at) idx = k
  }
  return idx
})
const currentPhase = computed(() =>
  phaseIndex.value >= 0 ? compiledChoreo.value?.phases?.[phaseIndex.value] ?? null : null,
)
const focusIndex = computed(() => currentPhase.value?.focus ?? -1)
const displayFocusIndex = computed(() =>
  showcaseLayout.value === 'sequential-cards' ? Math.max(0, focusIndex.value) : focusIndex.value,
)

// pulse 强调：相位切换瞬间一次性小弹跳——交替 a/b 类名重启同款动画
const pulseFlip = ref(false)
watch(phaseIndex, (val, old) => {
  if (val < 0 || val === old) return
  if (currentPhase.value?.accent === 'pulse') pulseFlip.value = !pulseFlip.value
})

// 每卡 CSS 变量（编译产物 → 参数化静态 keyframes）；焦点卡置顶交给内联 zIndex
function cardStyle(card, idx) {
  return {
    left: card.base.xPct.toFixed(2) + '%',
    top: card.base.yPct.toFixed(2) + '%',
    zIndex: idx === displayFocusIndex.value ? 40 : card.base.z,
    '--rot0': card.base.rotDeg.toFixed(2) + 'deg',
    '--dx': card.drift.dxPct.toFixed(2) + '%',
    '--dy': card.drift.dyPct.toFixed(2) + '%',
    '--drot': card.drift.dRotDeg.toFixed(2) + 'deg',
    '--drift-period': card.drift.periodS.toFixed(2) + 's',
    '--drift-delay': card.drift.delayS.toFixed(2) + 's',
    '--breathe-amp': (1 + card.breathe.amp).toFixed(4),
    '--breathe-period': card.breathe.periodS.toFixed(2) + 's',
    '--enter-delay': card.enter.delayS.toFixed(2) + 's',
    '--enter-dur': card.enter.durS.toFixed(2) + 's',
  }
}

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
  if (typeof window !== 'undefined' && window.matchMedia) {
    reducedMotionMedia = window.matchMedia('(prefers-reduced-motion: reduce)')
    syncReducedMotion(reducedMotionMedia)
    reducedMotionMedia.addEventListener?.('change', syncReducedMotion)
    reducedMotionMedia.addListener?.(syncReducedMotion)
  }  if (!settings.tiandituKey) {
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

        <!-- 节点展示页：由受限的 AI 转场语法驱动；路线绽放才使用圆形揭幕。 -->
        <div
          v-if="showcase"
          class="showcase-scene absolute inset-0 bg-black overflow-hidden"
          :class="[`showcase-enter-${showcaseTransition.kind}`, { 'reduce-motion': prefersReducedMotion }]"
          :data-transition="showcaseTransition.kind"
          :style="showcaseTransition.style"
        >
          <!-- 无编排配置（或图未加载齐）：现状全屏铺底；1 图+配置时叠加微呼吸（≤2%） -->
          <img
            v-if="!cardMode && (showcaseLayout !== 'text-first' || textFirstImageVisible) && currentImg"
            :src="currentImg"
            class="absolute inset-0 w-full h-full object-cover"
            :class="fullbleedBreathe ? 'choreo-breathe' : ''"
            :style="fullbleedStyle"
            alt=""
          />
          <div class="absolute inset-0 bg-black/40"></div>

          <!-- 编排卡片（≥2 图且有配置）：容器 z-0 自建堆叠上下文，
               卡内 z 再高也压不住后面的文字块/控件；:key 换站重启入场动画 -->
          <div v-if="cardMode" :key="'cards-' + showcase.stopIndex" class="absolute inset-0 z-0 pointer-events-none">
            <div
              v-for="(card, idx) in compiledChoreo.cards"
              :key="idx"
              class="choreo-card"
              :class="{
                'is-focus': idx === displayFocusIndex,
                'is-dim': displayFocusIndex >= 0 && idx !== displayFocusIndex,
                'is-sequential': showcaseLayout === 'sequential-cards',
                'is-sequential-past': showcaseLayout === 'sequential-cards' && idx < displayFocusIndex,
                'is-sequential-hidden': showcaseLayout === 'sequential-cards' && idx > displayFocusIndex,
              }"
              :style="cardStyle(card, idx)"
            >
              <div class="choreo-enter">
                <div class="choreo-drift">
                  <div
                    class="choreo-pulse"
                    :class="idx === displayFocusIndex && currentPhase?.accent === 'pulse' ? (pulseFlip ? 'pulse-a' : 'pulse-b') : ''"
                  >
                    <img v-if="imgUrls[idx]" :src="imgUrls[idx]" class="choreo-img choreo-breathe" alt="" />
                  </div>
                </div>
              </div>
            </div>
          </div>

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

          <!-- 缩略图列只在非卡片模式显示（卡片本身就是图） -->
          <div v-if="imgUrls.length > 1 && !cardMode && showcaseLayout !== 'text-first'" class="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-2">
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

<style scoped>
/* —— Phase 4e 编排动效：少量静态参数化 keyframes + 每卡 CSS 变量 ——
   只用 transform/opacity（GPU 合成），待机动画自走不占 JS 帧；
   数值全部来自 compileChoreography（seed 确定性），此处零随机 */

.choreo-card {
  position: absolute;
  width: 36%;
  aspect-ratio: 4 / 3;
  transform: translate(-50%, -50%) rotate(var(--rot0)) scale(1);
  transition: transform 0.6s ease, opacity 0.6s ease; /* focusSwitch：600ms */
  will-change: transform, opacity;
}
.choreo-card.is-focus {
  transform: translate(-50%, -50%) rotate(var(--rot0)) scale(1.15);
}
.choreo-card.is-dim {
  opacity: 0.75;
}

/* staggerIn：错峰滑入+淡入（both = 延迟期间保持初始态） */
.choreo-enter {
  width: 100%;
  height: 100%;
  animation: choreoEnter var(--enter-dur) ease-out var(--enter-delay) both;
}
@keyframes choreoEnter {
  from {
    opacity: 0;
    transform: translateY(28px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* driftFloat：缓慢平移+微旋转往返（负 delay=相位差，卡片间不齐步） */
.choreo-drift {
  width: 100%;
  height: 100%;
  animation: choreoDrift var(--drift-period) ease-in-out var(--drift-delay) infinite alternate;
}
@keyframes choreoDrift {
  from {
    transform: translate(0, 0) rotate(0deg);
  }
  to {
    transform: translate(var(--dx), var(--dy)) rotate(var(--drot));
  }
}

/* pulseAccent：相位切换瞬间一次性小弹跳——a/b 同款动画交替重启 */
.choreo-pulse {
  width: 100%;
  height: 100%;
}
.choreo-pulse.pulse-a {
  animation: choreoPulseA 0.5s ease-out;
}
.choreo-pulse.pulse-b {
  animation: choreoPulseB 0.5s ease-out;
}
@keyframes choreoPulseA {
  0% { transform: scale(1); }
  40% { transform: scale(1.07); }
  100% { transform: scale(1); }
}
@keyframes choreoPulseB {
  0% { transform: scale(1); }
  40% { transform: scale(1.07); }
  100% { transform: scale(1); }
}

/* 卡片本体：圆角+细白描边+投影 */
.choreo-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 0.75rem;
  border: 2px solid rgba(255, 255, 255, 0.35);
  box-shadow: 0 10px 36px rgba(0, 0, 0, 0.45);
}

/* breathe：缩放呼吸（卡片与 1 图全屏铺底共用；铺底幅度 ≤2%） */
.choreo-breathe {
  animation: choreoBreathe var(--breathe-period) ease-in-out infinite alternate;
}
@keyframes choreoBreathe {
  from {
    transform: scale(1);
  }
  to {
    transform: scale(var(--breathe-amp));
  }
}
/* 展示页入口只由受限的 transition compiler 输出的 transform/opacity/clip-path 驱动。 */
.showcase-scene {
  will-change: transform, opacity, clip-path;
}
.showcase-enter-soft-dissolve {
  will-change: opacity;
}
.showcase-enter-photo-cascade .choreo-enter {
  animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
}
.showcase-enter-layer-unfold {
  transform-style: preserve-3d;
}
.choreo-card.is-sequential.is-dim {
  opacity: 0.28;
  transform: translate(-50%, -50%) rotate(var(--rot0)) scale(0.92);
}
/* 顺序卡片按 narrationFrac 逐张推进：过去卡退后，未来卡保持不可见但不卸载。 */
.choreo-card.is-sequential.is-sequential-past {
  opacity: 0.18;
  transform: translate(-50%, -50%) rotate(var(--rot0)) scale(0.86);
}
.choreo-card.is-sequential.is-sequential-hidden {
  opacity: 0;
  transform: translate(-50%, calc(-50% + 14px)) rotate(var(--rot0)) scale(0.88);
}
/* 系统减少动态效果时只保留 revealFrac 驱动的柔和叠化，停止内部自走动画。 */
.reduce-motion,
.reduce-motion * {
  animation: none !important;
  transition: none !important;
}
</style>

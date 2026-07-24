// Phase 4e：展示页编排动效——动效词汇表（预设集）+ LLM 配参 JSON + seed 确定性。
// LLM 只输出受限 JSON（tempo/phases/idle，见 server/choreography.js 的系统提示词，
// 两边词汇表语义人工保持同步）；全部动画数学都在这里，绝不执行 LLM 生成的代码。
import { mulberry32 } from './rand'

const TEMPOS = ['calm', 'medium', 'lively']
const TRANSITION_ENTERS = ['route-bloom', 'directional-wipe', 'photo-cascade', 'soft-dissolve', 'layer-unfold', 'chapter-slide']
const TRANSITION_ANCHORS = ['route-end', 'screen-center', 'image-focus']
const TRANSITION_DIRECTIONS = ['forward', 'left', 'right', 'up', 'down']
const TRANSITION_ENERGIES = ['calm', 'medium', 'accent']
const TRANSITION_LAYOUTS = ['text-first', 'hero-image', 'scattered-cards', 'sequential-cards']
const TRANSITION_EXITS = ['return-map', 'follow-route', 'soft-dissolve']

// tempo → 入场错峰间隔/时长、漂移与呼吸周期（秒）
const TEMPO_PARAMS = {
  calm: { staggerS: 0.9, enterDurS: 1.1, driftPeriodS: 16, breathePeriodS: 7 },
  medium: { staggerS: 0.6, enterDurS: 0.85, driftPeriodS: 11, breathePeriodS: 5.5 },
  lively: { staggerS: 0.35, enterDurS: 0.6, driftPeriodS: 7, breathePeriodS: 4 },
}

// 卡片基位安全区（%）：中上/右侧，避开左下文字块与底部控件条
const SAFE = { xMin: 35, xMax: 85, yMin: 8, yMax: 55 }

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const clamp01 = (v) => clamp(v, 0, 1)

function num(v, fallback) {
  if (v == null) return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

// 均分相位：N 张图 → at=i/N、focus=i（无 LLM 配置时的兜底节奏）
function transitionLayout(imageCount) {
  return imageCount >= 2 ? 'scattered-cards' : imageCount === 1 ? 'hero-image' : 'text-first'
}

function defaultTransition(imageCount) {
  if (imageCount <= 0) {
    return { enter: 'directional-wipe', anchor: 'route-end', direction: 'forward', energy: 'medium', layout: 'text-first', exit: 'follow-route' }
  }
  if (imageCount === 1) {
    return { enter: 'photo-cascade', anchor: 'image-focus', direction: 'forward', energy: 'medium', layout: 'hero-image', exit: 'follow-route' }
  }
  return { enter: 'photo-cascade', anchor: 'route-end', direction: 'forward', energy: 'medium', layout: 'scattered-cards', exit: 'follow-route' }
}

function legacyTransition(imageCount) {
  return { enter: 'route-bloom', anchor: 'route-end', direction: 'forward', energy: 'medium', layout: transitionLayout(imageCount), exit: 'return-map' }
}

function normalizeTransition(raw, imageCount) {
  const fallback = legacyTransition(imageCount)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return reduceTransition(fallback, imageCount)

  const transition = {
    enter: TRANSITION_ENTERS.includes(raw.enter) ? raw.enter : fallback.enter,
    anchor: TRANSITION_ANCHORS.includes(raw.anchor) ? raw.anchor : fallback.anchor,
    direction: TRANSITION_DIRECTIONS.includes(raw.direction) ? raw.direction : fallback.direction,
    energy: TRANSITION_ENERGIES.includes(raw.energy) ? raw.energy : fallback.energy,
    layout: TRANSITION_LAYOUTS.includes(raw.layout) ? raw.layout : fallback.layout,
    exit: TRANSITION_EXITS.includes(raw.exit) ? raw.exit : fallback.exit,
  }
  return reduceTransition(transition, imageCount)
}

function reduceTransition(transition, imageCount) {
  const reduced = { ...transition }
  if (imageCount < 2 && reduced.enter === 'layer-unfold') reduced.enter = 'photo-cascade'
  if (imageCount <= 0) {
    if (reduced.anchor === 'image-focus') reduced.anchor = 'route-end'
    if (reduced.enter === 'photo-cascade') reduced.enter = 'directional-wipe'
    if (['hero-image', 'scattered-cards', 'sequential-cards'].includes(reduced.layout)) reduced.layout = 'text-first'
  } else if (imageCount === 1 && ['scattered-cards', 'sequential-cards'].includes(reduced.layout)) {
    reduced.layout = 'hero-image'
  }
  return reduced
}
function evenPhases(imageCount) {
  const n = Math.max(1, imageCount | 0)
  return Array.from({ length: n }, (_, i) => ({ at: i / n, focus: i, accent: 'none' }))
}

export function defaultChoreography(imageCount) {
  return {
    tempo: 'medium',
    phases: evenPhases(imageCount),
    idle: { drift: 0.4, breathe: 0.3 },
    transition: defaultTransition(imageCount),
  }
}

// LLM 输出清洗：clamp 全部数值、focus 越界取模、at 排序去重且首个置 0、
// tempo 非法取 medium、缺字段补默认；整体不可用 → defaultChoreography
export function normalizeChoreography(raw, imageCount) {
  if (!raw || typeof raw !== 'object') return defaultChoreography(imageCount)

  const tempo = TEMPOS.includes(raw.tempo) ? raw.tempo : 'medium'

  const rawIdle = raw.idle && typeof raw.idle === 'object' ? raw.idle : {}
  const idle = {
    drift: clamp01(num(rawIdle.drift, 0.4)),
    breathe: clamp01(num(rawIdle.breathe, 0.3)),
  }

  let phases
  if (Array.isArray(raw.phases) && raw.phases.length > 0) {
    const count = Math.max(1, imageCount | 0)
    phases = raw.phases
      .map((p) => {
        const focusRaw = Math.trunc(num(p?.focus, 0))
        return {
          at: clamp01(num(p?.at, 0)),
          focus: ((focusRaw % count) + count) % count,
          accent: p?.accent === 'pulse' ? 'pulse' : 'none',
        }
      })
      .sort((a, b) => a.at - b.at)
    // 去重（同 at 保留先到者）
    const seen = new Set()
    phases = phases.filter((p) => (seen.has(p.at) ? false : (seen.add(p.at), true)))
    phases[0] = { ...phases[0], at: 0 } // 首相位必须从旁白开头生效
  } else {
    phases = evenPhases(imageCount)
  }

  const transition = normalizeTransition(raw.transition, imageCount)

  return { tempo, phases, idle, transition }
}

// 编译：配置 + imageCount + seed → 每张卡的确定性动效参数（纯函数，无 Math.random）。
// 输出只含 transform/opacity 语义的参数，组件用 CSS 动画消费。
export function compileChoreography(config, { imageCount, seed = 1 } = {}) {
  const count = imageCount | 0
  const cfg = normalizeChoreography(config, count)
  if (count <= 0) return { mode: 'none', transition: cfg.transition }
  const tp = TEMPO_PARAMS[cfg.tempo]
  const rand = mulberry32(seed)

  // 1 张图：不散落，全屏铺底仅微呼吸（撤 Ken Burns 的反馈——幅度 ≤2%）
  if (count === 1) {
    return {
      mode: 'fullbleed',
      breathe: {
        amp: 0.005 + cfg.idle.breathe * 0.015, // ≤ 0.02
        periodS: tp.breathePeriodS,
      },
      phases: cfg.phases,
      tempo: cfg.tempo,
      transition: cfg.transition,
    }
  }

  // ≥2 张：安全区内分列散落（列内 seed 抖动），避免卡片堆叠
  const colW = (SAFE.xMax - SAFE.xMin) / count
  // 漂移振幅：% 相对卡片自身盒子（CSS translate 百分比语义），卡宽约 36% 画面
  // → 实际位移约为数值的 1/3 画面百分比，取大些才看得出"坐不住"
  const driftAmp = 1.5 + cfg.idle.drift * 5.5
  const breatheAmp = 0.008 + cfg.idle.breathe * 0.04

  const cards = []
  for (let i = 0; i < count; i++) {
    const xCenter = SAFE.xMin + colW * (i + 0.5)
    const xPct = clamp(xCenter + (rand() - 0.5) * colW * 0.6, SAFE.xMin, SAFE.xMax)
    // 高低交错的 y 带 + seed 抖动，散而有序（"小孩子坐不住乱动，但有一定秩序"）
    const yBand = i % 2 === 0 ? 0.28 : 0.62
    const yPct = clamp(
      SAFE.yMin + (SAFE.yMax - SAFE.yMin) * (yBand + (rand() - 0.5) * 0.34),
      SAFE.yMin,
      SAFE.yMax,
    )
    cards.push({
      base: {
        xPct,
        yPct,
        rotDeg: (rand() - 0.5) * 12, // ±6°
        z: i + 1,
      },
      drift: {
        dxPct: (rand() - 0.5) * 2 * driftAmp,
        dyPct: (rand() - 0.5) * 2 * driftAmp * 0.7,
        dRotDeg: (rand() - 0.5) * 2 * (0.5 + cfg.idle.drift * 2),
        periodS: tp.driftPeriodS * (0.85 + rand() * 0.3),
        delayS: -rand() * tp.driftPeriodS, // 负延迟=相位差，卡片间不齐步
      },
      breathe: {
        amp: breatheAmp,
        periodS: tp.breathePeriodS * (0.9 + rand() * 0.2),
      },
      enter: {
        delayS: i * tp.staggerS,
        durS: tp.enterDurS,
      },
    })
  }

  return { mode: 'cards', cards, phases: cfg.phases, tempo: cfg.tempo, transition: cfg.transition }
}

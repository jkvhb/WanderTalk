import { easeInOutCubic, clamp01, edgeWindow } from './easing'
import { pointAlongPath, bearingAt, boundsOfPath, cumulativeLengths } from './geo'

const DEFAULTS = {
  introDuration: 3,
  flyDuration: 2.5, // 兜底：路径长度为 0 时的旅行段时长
  outroDuration: 4,
  dwellPadding: 0.8,
  wipeDuration: 0.7, // 圆形揭幕单程时长（dwell 两端各一次）
  overviewPitch: 25, // 总览俯仰角（用户拍板"接近俯视"，常量可调）
  boundsPadFrac: 0.15, // fitBounds 外扩比例（相对容器短边），给 pitch 形变留余量
  intro: { title: '', subtitle: '' },
  outro: { lines: [] },
}

// 旅行段时长随距离：clamp(d_km/50, 2, 6) 秒；距离缺失/为 0 用兜底
export function flyDurationForKm(dKm, fallback = 2.5) {
  if (!(dKm > 0)) return fallback
  return Math.min(6, Math.max(2, dKm / 50))
}

// stops: [{ node, audioDuration, routeToHere }]（有序，首个 routeToHere 通常为 []）
// 返回 { totalDuration, scenes, stops, wholeBounds, intro, outro, opts }
export function buildFlightTimeline(stops, opts = {}) {
  const o = { ...DEFAULTS, ...opts }
  o.intro = { ...DEFAULTS.intro, ...(opts.intro || {}) }
  o.outro = { ...DEFAULTS.outro, ...(opts.outro || {}) }

  // 全程包围盒 = 所有路线点 ∪ 所有节点坐标（intro/outro/无来路节点的相机）
  const allRoutePts = []
  stops.forEach((s) => {
    if (s.routeToHere) allRoutePts.push(...s.routeToHere)
  })
  const wholeBounds = boundsOfPath(allRoutePts, stops.map((s) => [s.node.lng, s.node.lat]))

  const scenes = []
  let t = 0
  const push = (kind, duration, stopIndex, extra) => {
    scenes.push({ kind, start: t, end: t + duration, duration, stopIndex, ...extra })
    t += duration
  }

  push('intro', o.introDuration, -1)
  stops.forEach((s, i) => {
    let legBounds = null
    if (s.routeToHere && s.routeToHere.length >= 2) {
      const cum = cumulativeLengths(s.routeToHere)
      const meters = cum[cum.length - 1]
      const prev = stops[i - 1]?.node
      // 段包围盒 = 路线 ∪ 两端节点（POI 可能离路几十米，纳入保证可见）
      legBounds = boundsOfPath(s.routeToHere, [
        [s.node.lng, s.node.lat],
        ...(prev ? [[prev.lng, prev.lat]] : []),
      ])
      push('fly', flyDurationForKm(meters / 1000, o.flyDuration), i, { path: s.routeToHere, legBounds, cum })
    }
    // dwell = 揭幕开 + 语音 + 停顿 + 揭幕收；相机在盖住瞬间暗中换场
    const nextHasLeg = stops[i + 1]?.routeToHere && stops[i + 1].routeToHere.length >= 2
    push('dwell', o.wipeDuration + (s.audioDuration || 0) + o.dwellPadding + o.wipeDuration, i, {
      audioDuration: s.audioDuration || 0,
      camBefore: legBounds ? { sceneId: `leg-${i}`, bounds: legBounds } : { sceneId: 'all', bounds: wholeBounds },
      camAfter: nextHasLeg ? { sceneId: `leg-${i + 1}`, bounds: null } : { sceneId: 'all', bounds: wholeBounds },
    })
  })
  push('outro', o.outroDuration, -1)

  // 回填 camAfter 的"下一段包围盒"（下一段 fly 场景在本 dwell 之后才 push）
  scenes.forEach((sc) => {
    if (sc.kind === 'dwell' && sc.camAfter.bounds == null) {
      const next = scenes.find((x) => x.kind === 'fly' && `leg-${x.stopIndex}` === sc.camAfter.sceneId)
      sc.camAfter = { ...sc.camAfter, bounds: next ? next.legBounds : wholeBounds }
    }
  })

  return { totalDuration: t, scenes, stops, wholeBounds, intro: o.intro, outro: o.outro, opts: o }
}

function sceneAt(timeline, tc) {
  let scene = timeline.scenes[0]
  for (const sc of timeline.scenes) {
    if (tc >= sc.start) scene = sc
    else break
  }
  return scene
}

const NO_AUDIO = { stopIndex: -1, playing: false, offset: 0 }

// 包围盒式相机：adapter 按 sceneId 记忆化 cameraForBounds，场景内相机静止（零抖动的根）
function boundsCamera(entry, o) {
  return {
    kind: 'bounds',
    sceneId: entry.sceneId,
    bounds: entry.bounds,
    pitch: o.overviewPitch,
    bearing: 0,
    padFrac: o.boundsPadFrac,
  }
}

// 给定时刻 t，输出该刻的相位/相机/车标/进度/揭幕/音频/海拔/叠加层（契约 v2）
export function sampleAt(timeline, t) {
  const total = timeline.totalDuration
  const tc = Math.max(0, Math.min(t, total))
  const scene = sceneAt(timeline, tc)
  const p = scene.duration > 0 ? clamp01((tc - scene.start) / scene.duration) : 0
  const o = timeline.opts
  const first = timeline.stops[0].node
  const last = timeline.stops[timeline.stops.length - 1].node
  const ALL = { sceneId: 'all', bounds: timeline.wholeBounds }

  if (scene.kind === 'intro') {
    return {
      phase: 'intro', t: tc,
      camera: boundsCamera(ALL, o),
      car: null, progress: null, showcase: null,
      activeStopIndex: -1, audio: { ...NO_AUDIO },
      altitude: first.altitude ?? null,
      overlay: { kind: 'intro', title: timeline.intro.title, subtitle: timeline.intro.subtitle },
    }
  }

  if (scene.kind === 'outro') {
    return {
      phase: 'outro', t: tc,
      camera: boundsCamera(ALL, o),
      car: null, showcase: null,
      progress: { legIndex: timeline.stops.length - 1, frac: 1 }, // 全程走完的上色态（seek 幂等）
      activeStopIndex: -1, audio: { ...NO_AUDIO },
      altitude: last.altitude ?? null,
      overlay: { kind: 'outro', lines: timeline.outro.lines },
    }
  }

  const i = scene.stopIndex
  const node = timeline.stops[i].node

  if (scene.kind === 'fly') {
    const eased = easeInOutCubic(p) // 车出站/进站缓入缓出
    const pos = pointAlongPath(scene.path, eased, scene.cum) || [node.lng, node.lat]
    const prevAlt = timeline.stops[i - 1]?.node.altitude
    const altitude =
      typeof prevAlt === 'number' && typeof node.altitude === 'number'
        ? Math.round(prevAlt + (node.altitude - prevAlt) * eased)
        : node.altitude ?? null
    return {
      phase: 'fly', t: tc,
      camera: boundsCamera({ sceneId: `leg-${i}`, bounds: scene.legBounds }, o),
      car: { lng: pos[0], lat: pos[1], headingDeg: bearingAt(scene.path, eased, 500, scene.cum), frac: eased },
      progress: { legIndex: i, frac: eased },
      showcase: null,
      activeStopIndex: i, audio: { ...NO_AUDIO },
      altitude, overlay: null,
    }
  }

  // dwell：揭幕(开) → 讲解 → 揭幕(收)；盖住瞬间相机暗中切下一段
  const wipe = o.wipeDuration
  const revealFrac = edgeWindow(p, scene.duration > 0 ? wipe / scene.duration : 0)
  const covered = tc - scene.start >= wipe
  const audioStart = scene.start + wipe // 语音窗口后移：盖住后才开讲
  const playing = scene.audioDuration > 0 && tc >= audioStart && tc < audioStart + scene.audioDuration
  const imgCount = node.images?.length ?? 0
  const imageIndex = imgCount > 0 ? Math.min(imgCount - 1, Math.floor(p * imgCount)) : 0
  return {
    phase: 'dwell', t: tc,
    camera: boundsCamera(covered ? scene.camAfter : scene.camBefore, o),
    car: null,
    progress: { legIndex: i, frac: 1 },
    showcase: { stopIndex: i, imageIndex, revealFrac },
    activeStopIndex: i,
    audio: playing ? { stopIndex: i, playing: true, offset: tc - audioStart } : { ...NO_AUDIO },
    altitude: node.altitude ?? null,
    overlay: null,
  }
}

import { easeInOutCubic, clamp01 } from './easing'
import { pointAlongPath, bearingAt, boundsOfPath, cumulativeLengths } from './geo'

const DEFAULTS = {
  introDuration: 3,
  flyDuration: 2.5, // 兜底：路径长度为 0 时的旅行段时长
  outroDuration: 4,
  dwellPadding: 0.8,
  showcaseEnterDuration: 2.8, // 到站镜头居中与节点信息进入；旁白等它完成后开始
  showcaseExitDuration: 0.5, // 讲解层淡出时长
  showcaseZoom: 10.2, // 区域级视野，禁止街道级下钻
  showcaseCameraEaseMs: 2800,
  overviewPitch: 25, // 总览俯仰角（用户拍板"接近俯视"，常量可调）
  boundsPadFrac: 0.15, // fitBounds 外扩比例（相对容器短边），给 pitch 形变留余量
  camEaseMaxMs: 3000, // 段间镜头滑动时长上限（用户手测定 3s）
  camEaseShare: 0.7, // 滑动最多占场景时长的比例——短段防止车到站了镜头还在飘
  intro: { title: '', subtitle: '' },
  outro: { lines: [] },
}

// 旅行段时长随距离：clamp(d_km/30, 4, 10) 秒；距离缺失/为 0 用兜底
// （2026-07-05 手测：原 clamp(d/50,2,6) 的小车段偏短，整体上调 ~1.7 倍）
export function flyDurationForKm(dKm, fallback = 2.5) {
  if (!(dKm > 0)) return fallback
  return Math.min(10, Math.max(4, dKm / 30))
}

// stops: [{ node, audioDuration, routeToHere }]（有序，首个 routeToHere 通常为 []）
// 返回 { totalDuration, scenes, stops, wholeBounds, intro, outro, opts }
export function buildFlightTimeline(stops, opts = {}) {
  const o = { ...DEFAULTS, ...opts }
  // 旧调用仍可能只传 wipeDuration；只把它当作时长兼容，不恢复任何揭幕语义。
  if (opts.wipeDuration != null) {
    if (opts.showcaseEnterDuration == null) o.showcaseEnterDuration = opts.wipeDuration
    if (opts.showcaseExitDuration == null) o.showcaseExitDuration = opts.wipeDuration
  }
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
    let arrivalHeadingDeg = 90
    if (s.routeToHere && s.routeToHere.length >= 2) {
      const cum = cumulativeLengths(s.routeToHere)
      const meters = cum[cum.length - 1]
      arrivalHeadingDeg = bearingAt(s.routeToHere, 1, 500, cum)
      const prev = stops[i - 1]?.node
      // 段包围盒 = 路线 ∪ 两端节点（POI 可能离路几十米，纳入保证可见）
      legBounds = boundsOfPath(s.routeToHere, [
        [s.node.lng, s.node.lat],
        ...(prev ? [[prev.lng, prev.lat]] : []),
      ])
      push('fly', flyDurationForKm(meters / 1000, o.flyDuration), i, { path: s.routeToHere, legBounds, cum })
    }
    // dwell = 镜头居中/信息进入 + 语音 + 停顿 + 信息退出；地图全程可见。
    push('dwell', o.showcaseEnterDuration + (s.audioDuration || 0) + o.dwellPadding + o.showcaseExitDuration, i, {
      audioDuration: s.audioDuration || 0,
      arrivalHeadingDeg,
    })
  })
  push('outro', o.outroDuration, -1)

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

// 包围盒式相机：adapter 按 sceneId 记忆化 cameraForBounds，场景内相机静止（零抖动的根）。
// easeMs>0 时场景切换用 flyTo 可见飞行；缺省=瞬时定位（intro/dwell，seek 不拖泥带水）
function boundsCamera(entry, o, easeMs) {
  return {
    kind: 'bounds',
    sceneId: entry.sceneId,
    bounds: entry.bounds,
    pitch: o.overviewPitch,
    bearing: 0,
    padFrac: o.boundsPadFrac,
    ...(easeMs != null ? { easeMs } : {}),
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
      camera: boundsCamera(ALL, o, o.camEaseMaxMs), // 片尾缓缓拉远到全程
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
      camera: boundsCamera(
        { sceneId: `leg-${i}`, bounds: scene.legBounds },
        o,
        Math.min(o.camEaseMaxMs, Math.round(scene.duration * 1000 * o.camEaseShare)),
      ),
      car: { lng: pos[0], lat: pos[1], headingDeg: bearingAt(scene.path, eased, 500, scene.cum), frac: eased },
      progress: { legIndex: i, frac: eased },
      showcase: null,
      activeStopIndex: i, audio: { ...NO_AUDIO },
      altitude, overlay: null,
    }
  }

  // dwell：镜头居中/信息进入 → 讲解 → 信息退出。没有遮罩，地图始终在底层可见。
  const enterDuration = o.showcaseEnterDuration
  const exitDuration = o.showcaseExitDuration
  const enterFrac = enterDuration > 0 ? clamp01((tc - scene.start) / enterDuration) : 1
  const exitStart = scene.end - exitDuration
  const exitFrac = exitDuration > 0 ? clamp01((tc - exitStart) / exitDuration) : 1
  const audioStart = scene.start + enterDuration
  const playing = scene.audioDuration > 0 && tc >= audioStart && tc < audioStart + scene.audioDuration
  const imgCount = node.images?.length ?? 0
  const narrationFrac =
    scene.audioDuration > 0 ? clamp01((tc - audioStart) / scene.audioDuration) : 0
  const imageIndex = imgCount > 0 ? Math.min(imgCount - 1, Math.floor(narrationFrac * imgCount)) : 0
  return {
    phase: 'dwell', t: tc,
    camera: {
      kind: 'point',
      sceneId: `stop-${i}`,
      lng: node.lng,
      lat: node.lat,
      zoom: o.showcaseZoom,
      pitch: o.overviewPitch,
      bearing: 0,
      easeMs: o.showcaseCameraEaseMs,
    },
    car: { lng: node.lng, lat: node.lat, headingDeg: scene.arrivalHeadingDeg, frac: 1 },
    progress: { legIndex: i, frac: 1 },
    showcase: { stopIndex: i, imageIndex, enterFrac, narrationFrac, exitFrac },
    activeStopIndex: i,
    audio: playing ? { stopIndex: i, playing: true, offset: tc - audioStart } : { ...NO_AUDIO },
    altitude: node.altitude ?? null,
    overlay: null,
  }
}

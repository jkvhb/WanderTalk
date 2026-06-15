import { easeInOutCubic, clamp01 } from './easing'
import { pointAlongPath } from './geo'

const DEFAULTS = {
  introDuration: 3,
  flyDuration: 2.5,
  outroDuration: 4,
  dwellPadding: 0.8,
  zoom: 9,
  pitch: 60,
  intro: { title: '', subtitle: '' },
  outro: { lines: [] },
}

// stops: [{ node, audioDuration, routeToHere }]（有序，首个 routeToHere 通常为 []）
// 返回 { totalDuration, scenes, stops, intro, outro, opts }
export function buildFlightTimeline(stops, opts = {}) {
  const o = { ...DEFAULTS, ...opts }
  o.intro = { ...DEFAULTS.intro, ...(opts.intro || {}) }
  o.outro = { ...DEFAULTS.outro, ...(opts.outro || {}) }

  const scenes = []
  let t = 0
  const push = (kind, duration, stopIndex, path) => {
    scenes.push({ kind, start: t, end: t + duration, duration, stopIndex, path: path ?? null })
    t += duration
  }

  push('intro', o.introDuration, -1)
  stops.forEach((s, i) => {
    if (s.routeToHere && s.routeToHere.length >= 2) {
      push('fly', o.flyDuration, i, s.routeToHere)
    }
    push('dwell', (s.audioDuration || 0) + o.dwellPadding, i)
  })
  push('outro', o.outroDuration, -1)

  return { totalDuration: t, scenes, stops, intro: o.intro, outro: o.outro, opts: o }
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
const NO_CARD = { visible: false, stopIndex: -1, imageIndex: 0 }

// 给定时刻 t，输出该刻的相位/相机/活动节点/音频/卡片/海拔/叠加层状态
export function sampleAt(timeline, t) {
  const total = timeline.totalDuration
  const tc = Math.max(0, Math.min(t, total))
  const scene = sceneAt(timeline, tc)
  const p = scene.duration > 0 ? clamp01((tc - scene.start) / scene.duration) : 0
  const { zoom, pitch } = timeline.opts
  const first = timeline.stops[0].node
  const last = timeline.stops[timeline.stops.length - 1].node

  if (scene.kind === 'intro') {
    return {
      phase: 'intro', t: tc,
      camera: { lng: first.lng, lat: first.lat, zoom, pitch },
      activeStopIndex: -1, audio: { ...NO_AUDIO }, card: { ...NO_CARD },
      altitude: first.altitude ?? null,
      overlay: { kind: 'intro', title: timeline.intro.title, subtitle: timeline.intro.subtitle },
    }
  }

  if (scene.kind === 'outro') {
    return {
      phase: 'outro', t: tc,
      camera: { lng: last.lng, lat: last.lat, zoom, pitch },
      activeStopIndex: -1, audio: { ...NO_AUDIO }, card: { ...NO_CARD },
      altitude: last.altitude ?? null,
      overlay: { kind: 'outro', lines: timeline.outro.lines },
    }
  }

  const i = scene.stopIndex
  const node = timeline.stops[i].node

  if (scene.kind === 'fly') {
    const eased = easeInOutCubic(p)
    const pos = pointAlongPath(scene.path, eased) || [node.lng, node.lat]
    const prevAlt = timeline.stops[i - 1]?.node.altitude
    const altitude =
      typeof prevAlt === 'number' && typeof node.altitude === 'number'
        ? Math.round(prevAlt + (node.altitude - prevAlt) * eased)
        : node.altitude ?? null
    return {
      phase: 'fly', t: tc,
      camera: { lng: pos[0], lat: pos[1], zoom, pitch },
      activeStopIndex: i, audio: { ...NO_AUDIO }, card: { ...NO_CARD },
      altitude, overlay: null,
    }
  }

  // dwell
  const imgCount = node.images?.length ?? 0
  const imageIndex = imgCount > 0 ? Math.min(imgCount - 1, Math.floor(p * imgCount)) : 0
  return {
    phase: 'dwell', t: tc,
    camera: { lng: node.lng, lat: node.lat, zoom, pitch },
    activeStopIndex: i,
    audio: { stopIndex: i, playing: true, offset: tc - scene.start },
    card: { visible: true, stopIndex: i, imageIndex },
    altitude: node.altitude ?? null,
    overlay: null,
  }
}

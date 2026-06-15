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

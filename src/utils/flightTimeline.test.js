import { describe, it, expect } from 'vitest'
import { buildFlightTimeline } from './flightTimeline'

const OPTS = {
  introDuration: 3,
  flyDuration: 2.5,
  outroDuration: 4,
  dwellPadding: 1,
  zoom: 9,
  pitch: 60,
  intro: { title: 'T', subtitle: 'S' },
  outro: { lines: ['L1'] },
}

function twoStops() {
  return [
    { node: { lng: 0, lat: 0, name: 'A', altitude: 100, images: [] }, audioDuration: 2, routeToHere: [] },
    { node: { lng: 1, lat: 0, name: 'B', altitude: 200, images: ['a', 'b'] }, audioDuration: 3, routeToHere: [[0, 0], [1, 0]] },
  ]
}

describe('buildFlightTimeline', () => {
  it('首个 stop 无 routeToHere → 无 fly 场景；总时长正确', () => {
    const tl = buildFlightTimeline(twoStops(), OPTS)
    const kinds = tl.scenes.map((s) => s.kind)
    // intro, dwell(A), fly(B), dwell(B), outro
    expect(kinds).toEqual(['intro', 'dwell', 'fly', 'dwell', 'outro'])
    // 3 + (2+1) + 2.5 + (3+1) + 4 = 16.5
    expect(tl.totalDuration).toBeCloseTo(16.5, 6)
  })

  it('场景首尾相接、按时间排列', () => {
    const tl = buildFlightTimeline(twoStops(), OPTS)
    expect(tl.scenes[0].start).toBe(0)
    for (let i = 1; i < tl.scenes.length; i++) {
      expect(tl.scenes[i].start).toBeCloseTo(tl.scenes[i - 1].end, 6)
    }
    expect(tl.scenes.at(-1).end).toBeCloseTo(tl.totalDuration, 6)
  })

  it('保留 stops/intro/outro/opts 供采样使用', () => {
    const tl = buildFlightTimeline(twoStops(), OPTS)
    expect(tl.stops).toHaveLength(2)
    expect(tl.intro.title).toBe('T')
    expect(tl.outro.lines).toEqual(['L1'])
    expect(tl.opts.zoom).toBe(9)
  })

  it('opts 缺省值可用（只给 intro/outro 内容）', () => {
    const tl = buildFlightTimeline(twoStops(), { intro: { title: 'x' }, outro: { lines: [] } })
    expect(tl.totalDuration).toBeGreaterThan(0)
    expect(tl.opts.flyDuration).toBeGreaterThan(0)
  })
})

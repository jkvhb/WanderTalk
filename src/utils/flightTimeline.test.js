import { describe, it, expect } from 'vitest'
import { buildFlightTimeline, sampleAt } from './flightTimeline'

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

describe('sampleAt', () => {
  const tl = buildFlightTimeline(twoStops(), OPTS)
  // 时间线：intro 0-3 | dwell A 3-6 | fly B 6-8.5 | dwell B 8.5-12.5 | outro 12.5-16.5

  it('intro 段：片头叠加层 + 相机在首节点', () => {
    const s = sampleAt(tl, 1)
    expect(s.phase).toBe('intro')
    expect(s.overlay).toEqual({ kind: 'intro', title: 'T', subtitle: 'S' })
    expect(s.camera).toMatchObject({ lng: 0, lat: 0, zoom: 9, pitch: 60 })
    expect(s.card.visible).toBe(false)
    expect(s.audio.playing).toBe(false)
  })

  it('dwell A：卡片可见、播放 stop0、offset 为段内偏移、海拔为节点海拔', () => {
    const s = sampleAt(tl, 4) // dwell A 始于 3
    expect(s.phase).toBe('dwell')
    expect(s.activeStopIndex).toBe(0)
    expect(s.audio).toEqual({ stopIndex: 0, playing: true, offset: 1 })
    expect(s.card).toMatchObject({ visible: true, stopIndex: 0 })
    expect(s.altitude).toBe(100)
  })

  it('fly B：相机沿 routeToHere 缓动、海拔在两节点间插值', () => {
    const s = sampleAt(tl, 7) // fly 6-8.5, p=0.4
    expect(s.phase).toBe('fly')
    expect(s.activeStopIndex).toBe(1)
    expect(s.camera.lng).toBeCloseTo(0.256, 3) // easeInOutCubic(0.4)=0.256，单段线性
    expect(s.camera.lat).toBeCloseTo(0, 6)
    expect(s.altitude).toBe(126) // round(100 + 100*0.256)
    expect(s.audio.playing).toBe(false)
  })

  it('dwell B：图片索引随段内进度在图片数内均分切换', () => {
    expect(sampleAt(tl, 9).card.imageIndex).toBe(0) // p=(9-8.5)/4=0.125 → 0
    expect(sampleAt(tl, 12).card.imageIndex).toBe(1) // p=0.875 → 1
  })

  it('outro 段：片尾叠加层 + 相机在末节点', () => {
    const s = sampleAt(tl, 16.5)
    expect(s.phase).toBe('outro')
    expect(s.overlay).toEqual({ kind: 'outro', lines: ['L1'] })
    expect(s.camera).toMatchObject({ lng: 1, lat: 0 })
  })

  it('t 越界被夹住', () => {
    expect(sampleAt(tl, -5).phase).toBe('intro')
    expect(sampleAt(tl, 999).phase).toBe('outro')
  })
})

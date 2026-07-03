import { describe, it, expect } from 'vitest'
import { buildFlightTimeline, sampleAt, flyDurationForKm } from './flightTimeline'
import { pathLength } from './geo'

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

describe('flyDurationForKm', () => {
  it('clamp(d/50, 2, 6)：100km=2s、200km=4s、600km 封顶 6s、30km 下限 2s', () => {
    expect(flyDurationForKm(100)).toBe(2)
    expect(flyDurationForKm(200)).toBe(4)
    expect(flyDurationForKm(600)).toBe(6)
    expect(flyDurationForKm(30)).toBe(2)
  })
  it('距离缺失/为 0 用兜底值', () => {
    expect(flyDurationForKm(0, 2.5)).toBe(2.5)
    expect(flyDurationForKm(undefined, 2.5)).toBe(2.5)
  })
})

describe('buildFlightTimeline', () => {
  it('首个 stop 无 routeToHere → 无 fly 场景；总时长正确', () => {
    const tl = buildFlightTimeline(twoStops(), OPTS)
    const kinds = tl.scenes.map((s) => s.kind)
    expect(kinds).toEqual(['intro', 'dwell', 'fly', 'dwell', 'outro'])
    // 3 + (2+1) + flyDur + (3+1) + 4
    const flyDur = flyDurationForKm(pathLength([[0, 0], [1, 0]]) / 1000)
    expect(tl.totalDuration).toBeCloseTo(14 + flyDur, 6)
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

describe('buildFlightTimeline · smoothPath 与距离时长', () => {
  it('fly 场景时长 = flyDurationForKm(路径公里数)', () => {
    const tl = buildFlightTimeline(twoStops(), OPTS)
    const fly = tl.scenes.find((s) => s.kind === 'fly')
    const dKm = pathLength([[0, 0], [1, 0]]) / 1000
    expect(fly.duration).toBeCloseTo(flyDurationForKm(dKm), 6)
  })
  it('fly 场景带 smoothPath：端点与原折线一致', () => {
    const tl = buildFlightTimeline(twoStops(), OPTS)
    const fly = tl.scenes.find((s) => s.kind === 'fly')
    expect(fly.smoothPath[0]).toEqual([0, 0])
    expect(fly.smoothPath.at(-1)).toEqual([1, 0])
    expect(fly.smoothPath.length).toBeGreaterThan(2) // 已重采样
  })
})

describe('sampleAt', () => {
  const tl = buildFlightTimeline(twoStops(), OPTS)
  const flyDur = flyDurationForKm(pathLength([[0, 0], [1, 0]]) / 1000)
  const flyStart = 6 // intro 3 + dwell A (2+1)
  const dwellBStart = flyStart + flyDur

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
    const s = sampleAt(tl, flyStart + flyDur * 0.4) // p=0.4
    expect(s.phase).toBe('fly')
    expect(s.activeStopIndex).toBe(1)
    expect(s.camera.lng).toBeCloseTo(0.256, 3) // easeInOutCubic(0.4)=0.256，单段线性
    expect(s.camera.lat).toBeCloseTo(0, 6)
    expect(s.altitude).toBe(126) // round(100 + 100*0.256)
    expect(s.audio.playing).toBe(false)
  })

  it('dwell B：图片索引随段内进度在图片数内均分切换', () => {
    expect(sampleAt(tl, dwellBStart + 0.5).card.imageIndex).toBe(0) // p=0.5/4=0.125 → 0
    expect(sampleAt(tl, dwellBStart + 3.5).card.imageIndex).toBe(1) // p=3.5/4=0.875 → 1
  })

  it('outro 段：片尾叠加层 + 相机在末节点', () => {
    const s = sampleAt(tl, tl.totalDuration)
    expect(s.phase).toBe('outro')
    expect(s.overlay).toEqual({ kind: 'outro', lines: ['L1'] })
    expect(s.camera).toMatchObject({ lng: 1, lat: 0 })
  })

  it('t 越界被夹住', () => {
    expect(sampleAt(tl, -5).phase).toBe('intro')
    expect(sampleAt(tl, 999).phase).toBe('outro')
  })
})

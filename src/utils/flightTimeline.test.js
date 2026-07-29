import { describe, it, expect } from 'vitest'
import { buildFlightTimeline, sampleAt, flyDurationForKm } from './flightTimeline'
import { pathLength } from './geo'

const OPTS = {
  introDuration: 3,
  flyDuration: 2.5,
  outroDuration: 4,
  dwellPadding: 1,
  showcaseEnterDuration: 0.5,
  showcaseExitDuration: 0.5,
  showcaseCameraEaseMs: 500,
  showcaseZoom: 10.2,
  overviewPitch: 25,
  boundsPadFrac: 0.15,
  intro: { title: 'T', subtitle: 'S' },
  outro: { lines: ['L1'] },
}

function twoStops() {
  return [
    { node: { lng: 0, lat: 0, name: 'A', altitude: 100, images: [] }, audioDuration: 2, routeToHere: [] },
    { node: { lng: 1, lat: 0, name: 'B', altitude: 200, images: ['a', 'b'] }, audioDuration: 3, routeToHere: [[0, 0], [1, 0]] },
  ]
}
// 时间轴：intro 0-3 | dwell A 3-7（0.5+2+1+0.5）| fly 7-(7+flyDur) | dwell B 5s | outro 4

describe('flyDurationForKm', () => {
  it('clamp(d/30, 4, 10)：150km=5s、180km=6s、240km=8s、600km 封顶 10s、60km 下限 4s', () => {
    expect(flyDurationForKm(150)).toBe(5)
    expect(flyDurationForKm(180)).toBe(6)
    expect(flyDurationForKm(240)).toBe(8)
    expect(flyDurationForKm(600)).toBe(10)
    expect(flyDurationForKm(60)).toBe(4)
    expect(flyDurationForKm(100)).toBe(4) // 100/30≈3.33 → 下限兜住
  })
  it('距离缺失/为 0 用兜底值', () => {
    expect(flyDurationForKm(0, 2.5)).toBe(2.5)
    expect(flyDurationForKm(undefined, 2.5)).toBe(2.5)
  })
})

describe('buildFlightTimeline', () => {
  it('场景序列与总时长（dwell 含进入和退出）', () => {
    const tl = buildFlightTimeline(twoStops(), OPTS)
    expect(tl.scenes.map((s) => s.kind)).toEqual(['intro', 'dwell', 'fly', 'dwell', 'outro'])
    const flyDur = flyDurationForKm(pathLength([[0, 0], [1, 0]]) / 1000)
    // 3 + (0.5+2+1+0.5) + flyDur + (0.5+3+1+0.5) + 4
    expect(tl.totalDuration).toBeCloseTo(16 + flyDur, 6)
  })

  it('场景首尾相接、按时间排列', () => {
    const tl = buildFlightTimeline(twoStops(), OPTS)
    expect(tl.scenes[0].start).toBe(0)
    for (let i = 1; i < tl.scenes.length; i++) {
      expect(tl.scenes[i].start).toBeCloseTo(tl.scenes[i - 1].end, 6)
    }
    expect(tl.scenes.at(-1).end).toBeCloseTo(tl.totalDuration, 6)
  })

  it('保留 stops/intro/outro/opts；缺省节点展示参数生效', () => {
    const tl = buildFlightTimeline(twoStops(), OPTS)
    expect(tl.stops).toHaveLength(2)
    expect(tl.intro.title).toBe('T')
    expect(tl.outro.lines).toEqual(['L1'])
    expect(tl.opts.overviewPitch).toBe(25)
    const dft = buildFlightTimeline(twoStops(), { intro: { title: 'x' }, outro: { lines: [] } })
    expect(dft.opts.showcaseEnterDuration).toBeCloseTo(2.8, 6)
    expect(dft.opts.showcaseExitDuration).toBeCloseTo(0.5, 6)
    expect(dft.opts.showcaseCameraEaseMs).toBe(2800)
    expect(dft.opts.showcaseZoom).toBe(10.2)
    expect(dft.opts.overviewPitch).toBe(25)
    expect(dft.opts.boundsPadFrac).toBeCloseTo(0.15, 6)
  })

  it('包围盒预计算：wholeBounds/legBounds', () => {
    const tl = buildFlightTimeline(twoStops(), OPTS)
    expect(tl.wholeBounds).toEqual([[0, 0], [1, 0]])
    const fly = tl.scenes.find((s) => s.kind === 'fly')
    expect(fly.legBounds).toEqual([[0, 0], [1, 0]])
  })

  it('fly 场景带累计弧长表（末值=路径总长）', () => {
    const tl = buildFlightTimeline(twoStops(), OPTS)
    const fly = tl.scenes.find((s) => s.kind === 'fly')
    expect(fly.cum.at(-1)).toBeCloseTo(pathLength([[0, 0], [1, 0]]), 6)
    expect(fly.cum[0]).toBe(0)
  })
})

describe('sampleAt · 契约 v2', () => {
  const tl = buildFlightTimeline(twoStops(), OPTS)
  const flyDur = flyDurationForKm(pathLength([[0, 0], [1, 0]]) / 1000)
  const flyStart = 7 // intro 3 + dwell A 4
  const dwellBStart = flyStart + flyDur

  it('intro：全程包围盒总览相机 + 片头叠加层，无车/进度/揭幕', () => {
    const s = sampleAt(tl, 1)
    expect(s.phase).toBe('intro')
    expect(s.camera).toMatchObject({ kind: 'bounds', sceneId: 'all', pitch: 25, bearing: 0, padFrac: 0.15 })
    expect(s.camera.bounds).toEqual([[0, 0], [1, 0]])
    expect(s.car).toBeNull()
    expect(s.progress).toBeNull()
    expect(s.showcase).toBeNull()
    expect(s.audio.playing).toBe(false)
    expect(s.overlay).toEqual({ kind: 'intro', title: 'T', subtitle: 'S' })
  })

  it('fly：相机静止在段包围盒，车沿路线走、朝向正东，进度=车进度', () => {
    const s = sampleAt(tl, flyStart + flyDur * 0.5)
    expect(s.phase).toBe('fly')
    expect(s.camera).toMatchObject({ kind: 'bounds', sceneId: 'leg-1', pitch: 25 })
    expect(s.car.lng).toBeCloseTo(0.5, 3) // eased(0.5)=0.5
    expect(s.car.lat).toBeCloseTo(0, 6)
    expect(s.car.headingDeg).toBeCloseTo(90, 1)
    expect(s.car.frac).toBeCloseTo(0.5, 6)
    expect(s.progress.legIndex).toBe(1)
    expect(s.progress.frac).toBeCloseTo(0.5, 6) // 独立对齐 easeInOutCubic(0.5)=0.5，不引用 car.frac
    expect(s.showcase).toBeNull()
    expect(s.altitude).toBe(150) // round(100 + 100*0.5)
    // 镜头滑动时长 = min(上限 3s, 段时长×70%)——短段防止车到站了镜头还在飘
    expect(s.camera.easeMs).toBe(Math.min(3000, Math.round(flyDur * 700)))
  })

  it('dwell 输出独立进入与退出进度，不再输出圆形揭幕进度', () => {
    const dA = 3
    expect(sampleAt(tl, dA + 0.0001).showcase.enterFrac).toBeCloseTo(0, 2)
    expect(sampleAt(tl, dA + 0.25).showcase.enterFrac).toBeCloseTo(0.5, 6)
    expect(sampleAt(tl, dA + 0.5).showcase.enterFrac).toBe(1)
    expect(sampleAt(tl, dA + 2).showcase.exitFrac).toBe(0)
    expect(sampleAt(tl, dA + 3.75).showcase.exitFrac).toBeCloseTo(0.5, 6)
    expect(sampleAt(tl, dA + 3.999).showcase.exitFrac).toBeCloseTo(1, 2)
    expect(sampleAt(tl, dA + 1).showcase).not.toHaveProperty('revealFrac')
  })

  it('dwell 使用安全点相机平滑居中，不做街道级下钻', () => {
    const first = sampleAt(tl, 3.2).camera
    expect(first).toMatchObject({
      kind: 'point', sceneId: 'stop-0', lng: 0, lat: 0,
      zoom: 10.2, pitch: 25, bearing: 0, easeMs: 500,
    })
    const second = sampleAt(tl, dwellBStart + 0.2).camera
    expect(second).toMatchObject({ kind: 'point', sceneId: 'stop-1', lng: 1, lat: 0, zoom: 10.2 })
  })

  it('dwell 小车停在当前节点而不是从地图上消失', () => {
    const atA = sampleAt(tl, 4)
    expect(atA.car).toMatchObject({ lng: 0, lat: 0, frac: 1 })
    const atB = sampleAt(tl, dwellBStart + 1)
    expect(atB.car).toMatchObject({ lng: 1, lat: 0, frac: 1 })
    expect(atB.car.headingDeg).toBeCloseTo(90, 1)
  })

  it('语音窗口后移，并允许利用讲解后的停顿自然播完尾句', () => {
    expect(sampleAt(tl, 3.3).audio.playing).toBe(false)
    expect(sampleAt(tl, 4).audio).toEqual({ stopIndex: 0, playing: true, offset: 0.5 }) // audioStart=3.5
    expect(sampleAt(tl, 5.6).audio).toEqual({ stopIndex: 0, playing: true, offset: 2 })
    expect(sampleAt(tl, 6.49).audio.playing).toBe(true)
    expect(sampleAt(tl, 6.5).audio.playing).toBe(false) // 退出动画开始时才强制收尾
  })

  it('dwell 进度=该段走满；图片索引随进度切换', () => {
    expect(sampleAt(tl, 4).progress).toEqual({ legIndex: 0, frac: 1 })
    expect(sampleAt(tl, dwellBStart + 0.5).showcase.imageIndex).toBe(0) // p=0.1
    expect(sampleAt(tl, dwellBStart + 4.4).showcase.imageIndex).toBe(1) // p=0.88
  })

  it('narrationFrac：语音窗口前 0、窗口中=进度比例、窗口后 1（4e 相位驱动）', () => {
    // dwell A：3~7，audioStart=3.5，audioDuration=2 → 窗口 3.5~5.5
    expect(sampleAt(tl, 3.2).showcase.narrationFrac).toBe(0) // 揭幕期间未开讲
    expect(sampleAt(tl, 4.5).showcase.narrationFrac).toBeCloseTo(0.5, 6) // (4.5-3.5)/2
    expect(sampleAt(tl, 5.0).showcase.narrationFrac).toBeCloseTo(0.75, 6)
    expect(sampleAt(tl, 6.0).showcase.narrationFrac).toBe(1) // 讲完后保持 1
  })

  it('narrationFrac：无语音（audioDuration=0）恒为 0', () => {
    const stops = twoStops()
    stops[0].audioDuration = 0
    const tlNoAudio = buildFlightTimeline(stops, OPTS)
    // dwell A 变为 0.5+0+1+0.5=2s（3~5），整段 narrationFrac 恒 0
    expect(sampleAt(tlNoAudio, 3.2).showcase.narrationFrac).toBe(0)
    expect(sampleAt(tlNoAudio, 4.0).showcase.narrationFrac).toBe(0)
    expect(sampleAt(tlNoAudio, 4.8).showcase.narrationFrac).toBe(0)
  })

  it('outro：全程总览 + 片尾 + 全程走完的上色态', () => {
    const s = sampleAt(tl, tl.totalDuration)
    expect(s.phase).toBe('outro')
    expect(s.camera.sceneId).toBe('all')
    expect(s.overlay).toEqual({ kind: 'outro', lines: ['L1'] })
    expect(s.progress).toEqual({ legIndex: 1, frac: 1 })
    expect(s.car).toBeNull()
    expect(s.camera.easeMs).toBe(3000) // 片尾缓缓拉远到全程
    expect(sampleAt(tl, 1).camera.easeMs).toBeUndefined() // intro 首帧直接定位
  })

  it('t 越界被夹住', () => {
    expect(sampleAt(tl, -5).phase).toBe('intro')
    expect(sampleAt(tl, 999).phase).toBe('outro')
  })
})

import 'fake-indexeddb/auto'
import { setActivePinia, createPinia } from 'pinia'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// 默认所有音频都命中缓存（每段 2 秒）
const audioStore = new Map()
vi.mock('../utils/db', () => ({
  getCachedAudio: vi.fn(async (k) =>
    audioStore.has(k) ? audioStore.get(k) : { blob: new Blob(['x'], { type: 'audio/mpeg' }), duration: 2 },
  ),
}))

import { useFlightStore } from './flight'
import { useTripStore } from './trip'
import { audioKey } from '../composables/useTts'
import { buildFlightTimeline } from '../utils/flightTimeline'

describe('flight store buildFromPlan', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    audioStore.clear()
  })

  it('全部命中缓存 → 构建出时间轴、needsSynth 为空', async () => {
    const trip = useTripStore()
    trip.loadPreset318()
    trip.loadPresetNarration()
    const flight = useFlightStore()
    const ok = await flight.buildFromPlan()
    expect(ok).toBe(true)
    expect(flight.timeline.totalDuration).toBeGreaterThan(0)
    expect(flight.needsSynth).toEqual([])
    // 片头标题来自路书名
    expect(flight.timeline.intro.title).toContain('318')
    // 片尾包含里程/天数信息
    expect(flight.timeline.outro.lines.join(' ')).toMatch(/天/)
  })

  it('无旁白 → 返回 false 且给出错误', async () => {
    const trip = useTripStore()
    trip.loadPreset318() // 未写旁白
    const flight = useFlightStore()
    const ok = await flight.buildFromPlan()
    expect(ok).toBe(false)
    expect(flight.error).toBeTruthy()
  })

  it('部分节点缺音频 → needsSynth 列出名字、返回 false', async () => {
    const { getCachedAudio } = await import('../utils/db')
    const trip = useTripStore()
    trip.loadPreset318()
    trip.loadPresetNarration()
    const firstWp = trip.plan.days[0].waypoints[0]
    const missingKey = audioKey(firstWp.narration, trip.plan.voice, trip.plan.rate)
    getCachedAudio.mockImplementation(async (k) =>
      k === missingKey ? undefined : { blob: new Blob(['x'], { type: 'audio/mpeg' }), duration: 2 },
    )
    const flight = useFlightStore()
    const ok = await flight.buildFromPlan()
    expect(ok).toBe(false)
    expect(flight.needsSynth).toContain(firstWp.name)
  })
})

function tinyTimeline() {
  // intro 3 | dwell A (0.5+2+1+0.5=4) → 3~7 | fly ~3.71（111km/30 下限兜住后） | dwell B (0.5+3+1+0.5=5) | outro 4
  const stops = [
    { node: { lng: 0, lat: 0, name: 'A', altitude: 100, images: [] }, audioDuration: 2, routeToHere: [] },
    { node: { lng: 1, lat: 0, name: 'B', altitude: 200, images: [] }, audioDuration: 3, routeToHere: [[0, 0], [1, 0]] },
  ]
  return buildFlightTimeline(stops, {
    introDuration: 3, flyDuration: 2.5, outroDuration: 4, dwellPadding: 1, wipeDuration: 0.5,
    intro: { title: 'T', subtitle: '' }, outro: { lines: [] },
  })
}

describe('flight store 播放', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function setup() {
    const flight = useFlightStore()
    const adapter = { setCamera: vi.fn(), playAudio: vi.fn(), stopAudio: vi.fn() }
    const blob0 = new Blob(['0'])
    const blob1 = new Blob(['1'])
    flight.attach(adapter)
    flight.loadTimeline(tinyTimeline(), [blob0, blob1])
    return { flight, adapter, blob0, blob1 }
  }

  it('载入后立刻把相机设到 t=0（intro）', () => {
    const { adapter } = setup()
    expect(adapter.setCamera).toHaveBeenCalled()
  })

  it('seek 进 dwell A → 播放 blob0、offset 正确', () => {
    const { flight, adapter, blob0 } = setup()
    flight.seek(4) // dwell A 始于 3
    expect(adapter.playAudio).toHaveBeenCalledWith(blob0, 0.5)
    expect(flight.sample.phase).toBe('dwell')
  })

  it('seek 离开 dwell → 停止音频', () => {
    const { flight, adapter } = setup()
    flight.seek(4)
    flight.seek(1) // 回到 intro
    expect(adapter.stopAudio).toHaveBeenCalled()
  })

  it('play + tick 推进时间，到末尾自动停止并夹在 totalDuration', () => {
    const { flight } = setup()
    flight.play()
    flight.tick(4) // t=4 → dwell A
    expect(flight.sample.phase).toBe('dwell')
    flight.tick(100) // 越过末尾
    expect(flight.playing).toBe(false)
    expect(flight.t).toBeCloseTo(flight.totalDuration, 6)
  })

  it('setSpeed 影响推进步长', () => {
    const { flight } = setup()
    flight.setSpeed(2)
    flight.play()
    flight.tick(1) // 实际推进 2 秒
    expect(flight.t).toBeCloseTo(2, 6)
  })

  it('暂停后 tick 不再推进', () => {
    const { flight } = setup()
    flight.play()
    flight.tick(1)
    flight.pause()
    const frozen = flight.t
    flight.tick(5)
    expect(flight.t).toBe(frozen)
  })

  it('透传 setCar/setProgress：fly 有车、dwell 车为 null 且进度走满', () => {
    const flight = useFlightStore()
    const adapter = {
      setCamera: vi.fn(), playAudio: vi.fn(), stopAudio: vi.fn(),
      setCar: vi.fn(), setProgress: vi.fn(),
    }
    flight.attach(adapter)
    flight.loadTimeline(tinyTimeline(), [new Blob(['0']), new Blob(['1'])])
    flight.seek(8) // fly 段（7 ~ 约 10.7）
    expect(adapter.setCar).toHaveBeenLastCalledWith(
      expect.objectContaining({ lng: expect.any(Number), headingDeg: expect.any(Number) }),
    )
    expect(adapter.setProgress).toHaveBeenLastCalledWith(expect.objectContaining({ legIndex: 1 }))
    flight.seek(4) // dwell A
    expect(adapter.setCar).toHaveBeenLastCalledWith(null)
    expect(adapter.setProgress).toHaveBeenLastCalledWith({ legIndex: 0, frac: 1 })
  })

  it('旧 adapter 无 setCar/setProgress 也不报错（可选链）', () => {
    const flight = useFlightStore()
    flight.attach({ setCamera: vi.fn(), playAudio: vi.fn(), stopAudio: vi.fn() })
    expect(() => flight.loadTimeline(tinyTimeline(), [])).not.toThrow()
  })
})

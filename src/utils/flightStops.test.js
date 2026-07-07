import { describe, it, expect } from 'vitest'
import { collectNarratedStops, computeTotalDistance } from './flightStops'

// 一个两天的小路书；只给部分节点写旁白
function makePlan() {
  return {
    days: [
      {
        dayNumber: 1,
        segments: null,
        waypoints: [
          { name: 'A', lng: 0, lat: 0, altitude: 100, narration: '甲' },
          { name: 'B', lng: 1, lat: 0, altitude: 200, narration: '' }, // 无旁白，跳过
          { name: 'C', lng: 2, lat: 0, altitude: 300, narration: '丙' },
        ],
      },
      {
        dayNumber: 2,
        segments: null,
        waypoints: [
          { name: 'C', lng: 2, lat: 0, altitude: 300, narration: '' },
          { name: 'D', lng: 3, lat: 0, altitude: 400, narration: '丁' },
        ],
      },
    ],
  }
}

describe('collectNarratedStops', () => {
  it('只收集有旁白的节点，按全局顺序', () => {
    const stops = collectNarratedStops(makePlan())
    expect(stops.map((s) => s.node.name)).toEqual(['A', 'C', 'D'])
  })

  it('首个 stop 的 routeToHere 为空（无飞行）', () => {
    const stops = collectNarratedStops(makePlan())
    expect(stops[0].routeToHere).toEqual([])
  })

  it('routeToHere 串联中间被跳过的节点（直线兜底）', () => {
    const stops = collectNarratedStops(makePlan())
    // A→C 经过 B：A-B 段 + B-C 段，去重接点
    expect(stops[1].routeToHere).toEqual([[0, 0], [1, 0], [2, 0]])
  })

  it('node 带 narration/altitude/images 等字段', () => {
    const s = collectNarratedStops(makePlan())[0].node
    expect(s).toMatchObject({ name: 'A', lng: 0, lat: 0, altitude: 100, narration: '甲' })
    expect(s.images).toEqual([])
  })

  it('优先使用 day.segments[i].path', () => {
    const plan = {
      days: [
        {
          dayNumber: 1,
          segments: [{ fromName: 'A', toName: 'B', path: [[0, 0], [0.5, 0.5], [1, 0]], distance: 1, duration: 1 }],
          waypoints: [
            { name: 'A', lng: 0, lat: 0, altitude: 0, narration: '甲' },
            { name: 'B', lng: 1, lat: 0, altitude: 0, narration: '乙' },
          ],
        },
      ],
    }
    expect(collectNarratedStops(plan)[1].routeToHere).toEqual([[0, 0], [0.5, 0.5], [1, 0]])
  })

  it('无 plan 返回空数组', () => {
    expect(collectNarratedStops(null)).toEqual([])
  })
})

describe('computeTotalDistance', () => {
  it('无 segments 时用直线距离累加', () => {
    expect(computeTotalDistance(makePlan())).toBeGreaterThan(0)
  })
  it('有 segments 时累加 segment.distance', () => {
    const plan = {
      days: [{ dayNumber: 1, segments: [{ distance: 1000 }, { distance: 2000 }], waypoints: [{}, {}, {}] }],
    }
    expect(computeTotalDistance(plan)).toBe(3000)
  })
})

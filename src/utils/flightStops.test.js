import { describe, it, expect } from 'vitest'
import {
  collectNarratedStops,
  computeTotalDistance,
  findFlightRouteIssues,
} from './flightStops'

// 一个两天的小路书；只给部分节点写旁白
function makePlan() {
  return {
    days: [
      {
        dayNumber: 1,
        segments: [
          { path: [[0, 0], [0.5, 0.1], [1, 0]] },
          { path: [[1, 0], [1.5, -0.1], [2, 0]] },
        ],
        waypoints: [
          {
            name: 'A', lng: 0, lat: 0, altitude: 100, narration: '甲',
            choreography: { config: { tempo: 'calm' }, narrationHash: 'abc123' },
          },
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
  it('缺失真实驾驶路线时不编造节点直线，并指出需要重算的路段', () => {
    const plan = {
      days: [{
        dayNumber: 1,
        segments: null,
        waypoints: [
          { placeId: 'litang', name: '理塘', lng: 100.267931, lat: 29.996957, narration: '理塘' },
          { placeId: 'sister-lakes', name: '姊妹湖', lng: 99.551793, lat: 30.299644, narration: '姊妹湖' },
        ],
      }],
    }

    expect(collectNarratedStops(plan)[1].routeToHere).toEqual([])
    expect(findFlightRouteIssues(plan)).toEqual([
      { dayNumber: 1, fromName: '理塘', toName: '姊妹湖', reason: 'missing' },
    ])
  })

  it('旧数据中的路线段顺序错位时，按起终点名称找到真实折线', () => {
    const plan = {
      days: [{
        dayNumber: 3,
        waypoints: [
          { name: '理塘', lng: 100, lat: 30, narration: '理塘' },
          { name: '毛垭大草原', lng: 99.7, lat: 30.2, narrate: false },
          { name: '姊妹湖', lng: 99.5, lat: 30.3, narration: '姊妹湖' },
        ],
        segments: [
          {
            fromName: '毛垭大草原',
            toName: '姊妹湖',
            path: [[99.7, 30.2], [99.6, 30.28], [99.5, 30.3]],
          },
          {
            fromName: '理塘',
            toName: '毛垭大草原',
            path: [[100, 30], [99.85, 30.08], [99.7, 30.2]],
          },
        ],
      }],
    }

    expect(collectNarratedStops(plan)[1].routeToHere).toEqual([
      [100, 30], [99.85, 30.08], [99.7, 30.2], [99.6, 30.28], [99.5, 30.3],
    ])
    expect(findFlightRouteIssues(plan)).toEqual([])
  })

  it('只收集有旁白的节点，按全局顺序', () => {
    const stops = collectNarratedStops(makePlan())
    expect(stops.map((s) => s.node.name)).toEqual(['A', 'C', 'D'])
  })

  it('首个 stop 的 routeToHere 为空（无飞行）', () => {
    const stops = collectNarratedStops(makePlan())
    expect(stops[0].routeToHere).toEqual([])
  })

  it('routeToHere 串联中间被跳过节点的真实驾驶折线', () => {
    const stops = collectNarratedStops(makePlan())
    // A→C 经过 B：A-B 段 + B-C 段，去重接点
    expect(stops[1].routeToHere).toEqual([
      [0, 0], [0.5, 0.1], [1, 0], [1.5, -0.1], [2, 0],
    ])
  })

  it('node 带 narration/altitude/images 等字段', () => {
    const s = collectNarratedStops(makePlan())[0].node
    expect(s).toMatchObject({ name: 'A', lng: 0, lat: 0, altitude: 100, narration: '甲' })
    expect(s.images).toEqual([])
  })

  it('node 透传 choreography（4e 编排动效随 stop 进时间轴），缺省为 null', () => {
    const stops = collectNarratedStops(makePlan())
    expect(stops[0].node.choreography).toEqual({ config: { tempo: 'calm' }, narrationHash: 'abc123' })
    expect(stops[1].node.choreography).toBeNull() // C 未配置
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
  it('跨日相同地点即使误带两份旁白也只讲一次，并保留后续路线', () => {
    const plan = {
      days: [
        {
          dayNumber: 1,
          segments: null,
          waypoints: [
            { placeId: 'a', name: 'A', lng: 100, lat: 30, narration: 'A' },
            {
              placeId: 'litang',
              name: '理塘',
              lng: 100.27,
              lat: 29.997,
              narration: '理塘一',
              roles: ['stop', 'overnight'],
              source: { page: 8 },
            },
          ],
        },
        {
          dayNumber: 2,
          segments: [{ path: [[100.27, 29.997], [99.7, 30.1], [99.108, 30.004]] }],
          waypoints: [
            { placeId: 'litang', name: '理塘县', lng: 100.27, lat: 29.997, narration: '理塘二' },
            { placeId: 'batang', name: '巴塘', lng: 99.108, lat: 30.004, narration: '巴塘' },
          ],
        },
      ],
    }
    const stops = collectNarratedStops(plan)
    expect(stops.map((x) => x.node.placeId)).toEqual(['a', 'litang', 'batang'])
    expect(stops[1].node).toMatchObject({
      roles: ['stop', 'overnight'],
      source: { page: 8 },
    })
    expect(stops[2].routeToHere[0]).toEqual([100.27, 29.997])
    expect(stops[2].routeToHere.at(-1)).toEqual([99.108, 30.004])
    expect(stops[2].routeToHere).toHaveLength(3)
  })

  it('同名但相距很远且无共同 placeId 的地点不会误合并', () => {
    const plan = {
      days: [{
        dayNumber: 1,
        segments: null,
        waypoints: [
          { name: '幸福村', lng: 100, lat: 30, narration: '甲' },
          { name: '幸福村', lng: 102, lat: 32, narration: '乙' },
        ],
      }],
    }
    expect(collectNarratedStops(plan)).toHaveLength(2)
  })

  it('跳过路线点和 optional 点的讲解，但保留经过它们的完整路径', () => {
    const plan = {
      days: [{
        dayNumber: 1,
        segments: [
          { path: [[0, 0], [0.5, 0.1], [1, 0]] },
          { path: [[1, 0], [1.5, 0.1], [2, 0]] },
          { path: [[2, 0], [2.5, 0.1], [3, 0]] },
        ],
        waypoints: [
          { placeId: 'a', name: 'A', lng: 0, lat: 0, narration: '甲' },
          { placeId: 'route', name: '路线点', lng: 1, lat: 0, narration: '不该讲', narrate: false },
          { placeId: 'side', name: '支线点', lng: 2, lat: 0, narration: '不该讲', routeType: 'optional' },
          { placeId: 'd', name: 'D', lng: 3, lat: 0, narration: '丁' },
        ],
      }],
    }
    const stops = collectNarratedStops(plan)
    expect(stops.map((x) => x.node.placeId)).toEqual(['a', 'd'])
    expect(stops[1].routeToHere).toEqual([
      [0, 0], [0.5, 0.1], [1, 0], [1.5, 0.1],
      [2, 0], [2.5, 0.1], [3, 0],
    ])
  })

  it('压缩折线中的相邻重复坐标，少于两个有效点时清空路径', () => {
    const compacted = {
      days: [{
        dayNumber: 1,
        segments: [
          { path: [[0, 0], [0, 0], [1, 0], [1, 0]] },
          { path: [[1, 0], [1, 0], [2, 0]] },
        ],
        waypoints: [
          { placeId: 'a', name: 'A', lng: 0, lat: 0, narration: '甲' },
          { placeId: 'b', name: 'B', lng: 1, lat: 0, narration: '' },
          { placeId: 'c', name: 'C', lng: 2, lat: 0, narration: '丙' },
        ],
      }],
    }
    expect(collectNarratedStops(compacted)[1].routeToHere).toEqual([[0, 0], [1, 0], [2, 0]])

    const collapsed = {
      days: [{
        dayNumber: 1,
        segments: [{ path: [[0, 0], [0, 0]] }],
        waypoints: [
          { placeId: 'a', name: 'A', lng: 0, lat: 0, narration: '甲' },
          { placeId: 'b', name: 'B', lng: 0, lat: 0, narration: '乙' },
        ],
      }],
    }
    expect(collectNarratedStops(collapsed)[1].routeToHere).toEqual([])
  })
  it('不同有效 placeId 即使相距 50 米内也保留为两个讲解点', () => {
    const plan = {
      days: [{
        dayNumber: 1,
        segments: null,
        waypoints: [
          { placeId: 'east-gate', name: '东门', lng: 0, lat: 0, narration: '东门' },
          { placeId: 'museum', name: '博物馆', lng: 0.0002, lat: 0, narration: '博物馆' },
        ],
      }],
    }
    expect(collectNarratedStops(plan)).toHaveLength(2)
  })

  it('自动纠正反向 segment.path', () => {
    const plan = {
      days: [{
        dayNumber: 1,
        segments: [{ path: [[1, 0], [0.5, 0], [0, 0]] }],
        waypoints: [
          { placeId: 'a', name: 'A', lng: 0, lat: 0, narration: '甲' },
          { placeId: 'b', name: 'B', lng: 1, lat: 0, narration: '乙' },
        ],
      }],
    }
    expect(collectNarratedStops(plan)[1].routeToHere).toEqual([[0, 0], [0.5, 0], [1, 0]])
  })

  it('坏坐标或与端点断裂的 segment.path 不再伪造端点直线', () => {
    const invalid = {
      days: [{
        dayNumber: 1,
        segments: [{ path: [[0, 0], [Number.NaN, 0], [1, 0]] }],
        waypoints: [
          { placeId: 'a', name: 'A', lng: 0, lat: 0, narration: '甲' },
          { placeId: 'b', name: 'B', lng: 1, lat: 0, narration: '乙' },
        ],
      }],
    }
    expect(collectNarratedStops(invalid)[1].routeToHere).toEqual([])
    expect(findFlightRouteIssues(invalid)[0]?.reason).toBe('invalid')

    const disconnected = structuredClone(invalid)
    disconnected.days[0].segments[0].path = [[50, 50], [51, 51]]
    expect(collectNarratedStops(disconnected)[1].routeToHere).toEqual([])
    expect(findFlightRouteIssues(disconnected)[0]?.reason).toBe('disconnected')
  })

  it('返回同一 placeId 的有效环线不会被当作零移动重复点吞掉', () => {
    const plan = {
      days: [{
        dayNumber: 1,
        segments: [
          { path: [[0, 0], [1, 0]] },
          { path: [[1, 0], [0, 0]] },
        ],
        waypoints: [
          { placeId: 'a', name: 'A', lng: 0, lat: 0, narration: '出发' },
          { placeId: 'route', name: '路线点', lng: 1, lat: 0, narrate: false },
          { placeId: 'a', name: 'A', lng: 0, lat: 0, narration: '返回' },
        ],
      }],
    }
    const stops = collectNarratedStops(plan)
    expect(stops).toHaveLength(2)
    expect(stops[1].routeToHere).toEqual([[0, 0], [1, 0], [0, 0]])
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

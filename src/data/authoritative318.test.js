import { describe, expect, it } from 'vitest'
import { authoritative318 } from './authoritative318'

describe('authoritative318', () => {
  it('保留连续九天和 46 个不重复主线节点', () => {
    expect(authoritative318.days.map((day) => day.dayNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    const ids = authoritative318.days.flatMap((day) => day.nodes.map((node) => node.placeId))
    expect(ids).toHaveLength(46)
    expect(new Set(ids).size).toBe(46)
    expect(ids).toContain('yingguanzhai-junction')
    expect(ids).toContain('nimagong-viewpoint')
  })

  it('为每个节点提供讲解等级、内容底稿和图片身份要求', () => {
    for (const node of authoritative318.days.flatMap((day) => day.nodes)) {
      expect(['A', 'B', 'C']).toContain(node.narrationLevel)
      expect(node.contentBrief.trim()).not.toBe('')
      expect(node.imageIdentity.trim()).not.toBe('')
      expect(node.sourcePages.length).toBeGreaterThan(0)
      expect(node.routeType).toBe('main')
    }
  })

  it('把无名路口和尼玛贡神山都保存为已核验地点', () => {
    const unresolved = authoritative318.days
      .flatMap((day) => day.nodes)
      .filter((node) => node.resolve)
      .map((node) => node.placeId)
    expect(unresolved).toEqual([])
    const junction = authoritative318.days[1].nodes.find((node) => node.placeId === 'yingguanzhai-junction')
    expect(junction).toMatchObject({
      name: 'G318/G248交叉口（营官村）',
      location: {
        lng: 101.5466692,
        lat: 30.038074,
        coordinateSystem: 'WGS-84',
        source: { provider: 'openstreetmap-road-intersection' },
      },
    })
    const nimagong = authoritative318.days[2].nodes.find((node) => node.placeId === 'nimagong-viewpoint')
    expect(nimagong).toMatchObject({
      location: {
        lng: 100.7384845894722,
        lat: 30.08319221083286,
        coordinateSystem: 'WGS-84',
        source: {
          provider: 'amap-web-service',
          resultName: '尼玛贡神山大型观景台旅游服务区',
        },
      },
    })
  })

  it('把可选支线排除在每日主线之外', () => {
    const ids = authoritative318.days.flatMap((day) => day.nodes.map((node) => node.placeId))
    expect(ids).not.toContain('laigu-glacier')
    expect(ids).not.toContain('daocheng-yading')
    expect(authoritative318.alternatives.map((item) => item.placeId)).toContain('laigu-glacier')
  })
})

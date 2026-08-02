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

  it('只把两个尚未核验地点标记为需要检索', () => {
    const unresolved = authoritative318.days
      .flatMap((day) => day.nodes)
      .filter((node) => node.resolve)
      .map((node) => node.placeId)
    expect(unresolved).toEqual(['yingguanzhai-junction', 'nimagong-viewpoint'])
  })

  it('把可选支线排除在每日主线之外', () => {
    const ids = authoritative318.days.flatMap((day) => day.nodes.map((node) => node.placeId))
    expect(ids).not.toContain('laigu-glacier')
    expect(ids).not.toContain('daocheng-yading')
    expect(authoritative318.alternatives.map((item) => item.placeId)).toContain('laigu-glacier')
  })
})

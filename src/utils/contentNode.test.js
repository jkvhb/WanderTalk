import { describe, expect, it } from 'vitest'
import { isContentNode } from './contentNode'

describe('isContentNode', () => {
  it.each([null, undefined, 'bad', 1, true, []])('拒绝非对象节点：%s', (value) => {
    expect(isContentNode(value)).toBe(false)
  })

  it('旧数据默认是内容节点', () => {
    expect(isContentNode({ name: 'A' })).toBe(true)
  })

  it.each([
    [{ narrate: false }, false],
    [{ routeType: 'optional' }, false],
    [{ narrate: false, routeType: 'optional' }, false],
    [{ narrate: true, routeType: 'main' }, true],
  ])('按 narrate 和 routeType 四象限判断', (node, expected) => {
    expect(isContentNode(node)).toBe(expected)
  })
})

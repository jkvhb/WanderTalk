import { describe, expect, it } from 'vitest'
import { contentNodeEntries, isContentNode } from './contentNode'

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

describe('contentNodeEntries', () => {
  it('隐藏跨日重复路线起点，同时保留内容节点在原数组中的索引', () => {
    const routeOrigin = { name: '康定', narrate: false, routeType: 'main' }
    const stop = { name: '折多山垭口', narrate: true, routeType: 'main', images: ['img-1'] }
    const optional = { name: '支线', routeType: 'optional' }

    expect(contentNodeEntries([routeOrigin, stop, optional])).toEqual([
      { node: stop, index: 1 },
    ])
  })
})

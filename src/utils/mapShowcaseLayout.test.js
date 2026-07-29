import { describe, expect, it } from 'vitest'
import { resolveMapShowcaseLayout } from './mapShowcaseLayout'

const base = {
  viewport: { width: 1000, height: 600 },
  nodePoint: { x: 500, y: 300 },
  routePoints: [{ x: 120, y: 300 }, { x: 500, y: 300 }, { x: 850, y: 260 }],
  recentPresetIds: [],
  dayPresetCounts: {},
}

describe('resolveMapShowcaseLayout', () => {
  it('并列三图从上下胶片带中选择', () => {
    const result = resolveMapShowcaseLayout({
      ...base,
      story: { storyMode: 'parallel', imageOrder: [0, 1, 2], beats: [] },
      imageCount: 3,
    })

    expect(['top-filmstrip', 'bottom-filmstrip']).toContain(result.presetId)
  })

  it('路线占据底部时不选底部胶片带', () => {
    const result = resolveMapShowcaseLayout({
      ...base,
      routePoints: [{ x: 0, y: 540 }, { x: 1000, y: 540 }],
      story: { storyMode: 'parallel', imageOrder: [0, 1, 2], beats: [] },
      imageCount: 3,
    })

    expect(result.presetId).not.toBe('bottom-filmstrip')
  })

  it('相邻节点避免重复同一预设', () => {
    const result = resolveMapShowcaseLayout({
      ...base,
      recentPresetIds: ['right-rail'],
      story: { storyMode: 'sequential', imageOrder: [0, 1, 2], beats: [] },
      imageCount: 3,
    })

    expect(result.presetId).not.toBe('right-rail')
  })

  it('没有安全图片区时退回纯地图信息', () => {
    const result = resolveMapShowcaseLayout({
      ...base,
      nodePoint: { x: 80, y: 80 },
      routePoints: [
        { x: 0, y: 80 }, { x: 1000, y: 80 },
        { x: 80, y: 0 }, { x: 80, y: 600 },
        { x: 0, y: 540 }, { x: 1000, y: 540 },
      ],
      story: { storyMode: 'parallel', imageOrder: [0, 1, 2], beats: [] },
      imageCount: 3,
    })

    expect(result.presetId).toBe('map-only')
    expect(result.slots).toEqual([])
  })

  it('相同输入始终得到相同布局', () => {
    const input = {
      ...base,
      story: { storyMode: 'sequential', imageOrder: [2, 0, 1], beats: [{ at: 0, focus: 2 }] },
      imageCount: 3,
    }
    expect(resolveMapShowcaseLayout(input)).toEqual(resolveMapShowcaseLayout(input))
  })
})

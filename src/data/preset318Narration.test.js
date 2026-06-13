import { describe, it, expect } from 'vitest'
import { preset318Narration } from './preset318Narration'
import { preset318 } from './preset318'

describe('preset318Narration', () => {
  it('每条 key 都能在 preset318 节点名中找到', () => {
    const names = new Set(preset318.days.flatMap((d) => d.waypoints.map((w) => w.name)))
    for (const key of Object.keys(preset318Narration)) {
      expect(names.has(key)).toBe(true)
    }
  })
  it('起点成都与终点拉萨都有文案', () => {
    expect(preset318Narration['成都']).toContain('成都')
    expect(preset318Narration['拉萨']).toContain('拉萨')
  })
})

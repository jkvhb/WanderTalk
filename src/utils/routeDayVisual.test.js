import { describe, expect, it } from 'vitest'
import { routeDayColor } from './routeDayVisual'

describe('routeDayColor', () => {
  it('节点图钉与当天路线使用同一颜色并循环复用', () => {
    expect(routeDayColor(0)).toBe('#ef4444')
    expect(routeDayColor(4)).toBe('#8b5cf6')
    expect(routeDayColor(9)).toBe('#ef4444')
  })
})

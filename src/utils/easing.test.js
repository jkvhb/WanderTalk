import { describe, it, expect } from 'vitest'
import { easeInOutCubic, clamp01 } from './easing'

describe('easeInOutCubic', () => {
  it('端点固定为 0 与 1', () => {
    expect(easeInOutCubic(0)).toBe(0)
    expect(easeInOutCubic(1)).toBe(1)
  })
  it('中点为 0.5（对称）', () => {
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 6)
  })
  it('单调递增', () => {
    expect(easeInOutCubic(0.25)).toBeLessThan(easeInOutCubic(0.75))
    expect(easeInOutCubic(0.4)).toBeCloseTo(0.256, 3) // 4*0.4^3
  })
})

describe('clamp01', () => {
  it('夹到 [0,1]', () => {
    expect(clamp01(-1)).toBe(0)
    expect(clamp01(2)).toBe(1)
    expect(clamp01(0.3)).toBe(0.3)
  })
})

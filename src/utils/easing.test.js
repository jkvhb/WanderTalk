import { describe, it, expect } from 'vitest'
import { easeInOutCubic, clamp01, edgeWindow } from './easing'

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

describe('edgeWindow', () => {
  it('两端为 0，中段平台为 1', () => {
    expect(edgeWindow(0)).toBe(0)
    expect(edgeWindow(1)).toBe(0)
    expect(edgeWindow(0.5)).toBe(1)
    expect(edgeWindow(0.15)).toBe(1)
    expect(edgeWindow(0.85)).toBe(1)
  })
  it('上升沿/下降沿单调且经过中点 0.5', () => {
    expect(edgeWindow(0.075)).toBeCloseTo(0.5, 6) // easeInOutCubic(0.5)=0.5
    expect(edgeWindow(0.925)).toBeCloseTo(0.5, 6)
    expect(edgeWindow(0.03)).toBeLessThan(edgeWindow(0.06))
    expect(edgeWindow(0.94)).toBeGreaterThan(edgeWindow(0.97))
  })
  it('edge 可配；越界输入被夹住', () => {
    expect(edgeWindow(0.2, 0.4)).toBeCloseTo(easeInOutCubic(0.5), 6)
    expect(edgeWindow(-1)).toBe(0)
    expect(edgeWindow(2)).toBe(0)
  })
})

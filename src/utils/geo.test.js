import { describe, it, expect } from 'vitest'
import { haversine, pathLength, pointAlongPath } from './geo'

describe('haversine', () => {
  it('1 度纬度约 111km', () => {
    const d = haversine([0, 0], [0, 1])
    expect(d).toBeGreaterThan(110000)
    expect(d).toBeLessThan(112000)
  })
  it('同点为 0', () => {
    expect(haversine([100, 30], [100, 30])).toBe(0)
  })
})

describe('pathLength', () => {
  it('两点折线 = 两点距离', () => {
    expect(pathLength([[0, 0], [0, 1]])).toBeCloseTo(haversine([0, 0], [0, 1]), 3)
  })
  it('空/单点为 0', () => {
    expect(pathLength([])).toBe(0)
    expect(pathLength([[1, 2]])).toBe(0)
  })
})

describe('pointAlongPath', () => {
  it('frac=0 取首点，frac=1 取末点', () => {
    expect(pointAlongPath([[0, 0], [10, 0]], 0)).toEqual([0, 0])
    expect(pointAlongPath([[0, 0], [10, 0]], 1)).toEqual([10, 0])
  })
  it('frac=0.5 取单段中点', () => {
    const p = pointAlongPath([[0, 0], [10, 0]], 0.5)
    expect(p[0]).toBeCloseTo(5, 3)
    expect(p[1]).toBeCloseTo(0, 6)
  })
  it('frac 越界被夹住', () => {
    expect(pointAlongPath([[0, 0], [10, 0]], -1)).toEqual([0, 0])
    expect(pointAlongPath([[0, 0], [10, 0]], 2)).toEqual([10, 0])
  })
  it('单点折线返回该点', () => {
    expect(pointAlongPath([[3, 4]], 0.7)).toEqual([3, 4])
  })
})

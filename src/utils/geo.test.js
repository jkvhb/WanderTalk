import { describe, it, expect } from 'vitest'
import { haversine, pathLength, pointAlongPath, chaikinSmooth, resampleByDistance } from './geo'

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

describe('chaikinSmooth', () => {
  it('首尾端点不变', () => {
    const out = chaikinSmooth([[0, 0], [1, 0], [1, 1]], 2)
    expect(out[0]).toEqual([0, 0])
    expect(out.at(-1)).toEqual([1, 1])
  })
  it('顶点数按迭代增长：3 点 1 次迭代 → 6 点', () => {
    expect(chaikinSmooth([[0, 0], [1, 0], [1, 1]], 1)).toHaveLength(6)
  })
  it('切掉尖角：原拐点 [1,0] 不再出现', () => {
    const out = chaikinSmooth([[0, 0], [1, 0], [1, 1]], 1)
    expect(out.some(([x, y]) => x === 1 && y === 0)).toBe(false)
  })
  it('共线输入输出仍共线（lat 全 0）', () => {
    const out = chaikinSmooth([[0, 0], [0.5, 0], [1, 0]], 2)
    out.forEach(([, lat]) => expect(lat).toBe(0))
  })
  it('少于 3 点原样返回副本', () => {
    const p = [[0, 0], [1, 0]]
    const out = chaikinSmooth(p, 2)
    expect(out).toEqual(p)
    expect(out).not.toBe(p)
  })
})

describe('resampleByDistance', () => {
  it('相邻点距≈step、首尾保持', () => {
    const step = 11119 // ≈0.1 度经度
    const out = resampleByDistance([[0, 0], [1, 0]], step)
    expect(out[0]).toEqual([0, 0])
    expect(out.at(-1)).toEqual([1, 0])
    for (let i = 1; i < out.length; i++) {
      const d = haversine(out[i - 1], out[i])
      expect(Math.abs(d - step) / step).toBeLessThan(0.02)
    }
  })
  it('总长近似不变（±1%）', () => {
    const path = [[0, 0], [0.5, 0.2], [1, 0]]
    const out = resampleByDistance(path, 5000)
    expect(Math.abs(pathLength(out) - pathLength(path)) / pathLength(path)).toBeLessThan(0.01)
  })
  it('退化输入：少于 2 点或 step 非正 → 原样副本', () => {
    expect(resampleByDistance([[1, 2]], 100)).toEqual([[1, 2]])
    expect(resampleByDistance([[0, 0], [1, 0]], 0)).toEqual([[0, 0], [1, 0]])
  })
})

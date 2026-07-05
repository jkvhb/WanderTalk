import { describe, it, expect } from 'vitest'
import { haversine, pathLength, pointAlongPath, chaikinSmooth, resampleByDistance, bearingBetween, bearingAt, lerpAngle, boundsOfPath, cumulativeLengths } from './geo'

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
  it('iterations=0 也返回新数组（不与输入共享引用）', () => {
    const p = [[0, 0], [1, 0], [1, 1]]
    const out = chaikinSmooth(p, 0)
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

describe('bearingBetween', () => {
  it('正北 0°、正东 90°、正南 180°、正西 270°', () => {
    expect(bearingBetween([0, 0], [0, 1])).toBeCloseTo(0, 4)
    expect(bearingBetween([0, 0], [1, 0])).toBeCloseTo(90, 4)
    expect(bearingBetween([0, 1], [0, 0])).toBeCloseTo(180, 4)
    expect(bearingBetween([1, 0], [0, 0])).toBeCloseTo(270, 4)
  })
})

describe('bearingAt', () => {
  const east = [[0, 0], [1, 0]] // 正东直线，~111km
  it('直线路径任意 frac 都是路径方向', () => {
    expect(bearingAt(east, 0)).toBeCloseTo(90, 2)
    expect(bearingAt(east, 0.5)).toBeCloseTo(90, 2)
  })
  it('前瞻越过终点自动回退取向后窗口，不越界', () => {
    expect(bearingAt(east, 1)).toBeCloseTo(90, 2)
    expect(bearingAt(east, 0.999, 2000)).toBeCloseTo(90, 2)
  })
  it('退化输入返回 0', () => {
    expect(bearingAt([], 0.5)).toBe(0)
    expect(bearingAt([[0, 0], [0, 0]], 0.5)).toBe(0)
  })
})

describe('lerpAngle', () => {
  it('普通插值：0→180 中点 90', () => {
    expect(lerpAngle(0, 180, 0.5)).toBeCloseTo(90, 6)
  })
  it('跨 0° 走最短弧：350→10 中点 0，10→350 中点 0', () => {
    expect(lerpAngle(350, 10, 0.5)).toBeCloseTo(0, 6)
    expect(lerpAngle(10, 350, 0.5)).toBeCloseTo(0, 6)
  })
  it('端点精确、t 越界被夹住、输出在 [0,360)', () => {
    expect(lerpAngle(350, 10, 0)).toBeCloseTo(350, 6)
    expect(lerpAngle(350, 10, 1)).toBeCloseTo(10, 6)
    expect(lerpAngle(350, 10, 2)).toBeCloseTo(10, 6)
    expect(lerpAngle(0, 270, 0.5)).toBeCloseTo(315, 6) // 最短弧向负方向
  })
})

describe('cumulativeLengths + 二分定位', () => {
  it('cum 表首 0 末总长、单调不减', () => {
    const path = [[0, 0], [0.5, 0.2], [1, 0]]
    const cum = cumulativeLengths(path)
    expect(cum).toHaveLength(3)
    expect(cum[0]).toBe(0)
    expect(cum[2]).toBeCloseTo(pathLength(path), 6)
    expect(cum[1]).toBeGreaterThan(0)
  })
  it('pointAlongPath 带 cum 与不带结果一致', () => {
    const path = [[0, 0], [0.3, 0.1], [0.7, -0.2], [1, 0]]
    const cum = cumulativeLengths(path)
    for (const f of [0, 0.1, 0.33, 0.5, 0.77, 1]) {
      const a = pointAlongPath(path, f)
      const b = pointAlongPath(path, f, cum)
      expect(b[0]).toBeCloseTo(a[0], 9)
      expect(b[1]).toBeCloseTo(a[1], 9)
    }
  })
  it('bearingAt 带 cum 与不带结果一致', () => {
    const path = [[0, 0], [0.3, 0.1], [0.7, -0.2], [1, 0]]
    const cum = cumulativeLengths(path)
    for (const f of [0, 0.5, 1]) {
      expect(bearingAt(path, f, 2000, cum)).toBeCloseTo(bearingAt(path, f), 6)
    }
  })
  it('退化：短路径 cum=[0]', () => {
    expect(cumulativeLengths([[1, 2]])).toEqual([0])
    expect(cumulativeLengths(null)).toEqual([0])
  })
})

describe('boundsOfPath', () => {
  it('折线包围盒 [[minLng,minLat],[maxLng,maxLat]]', () => {
    expect(boundsOfPath([[0, 0], [2, 1], [1, -1]])).toEqual([[0, -1], [2, 1]])
  })
  it('extraPoints 参与包围盒', () => {
    expect(boundsOfPath([[0, 0]], [[5, 5], [-1, 2]])).toEqual([[-1, 0], [5, 5]])
  })
  it('空折线仅 extraPoints 也可；全空返回 null', () => {
    expect(boundsOfPath([], [[3, 4]])).toEqual([[3, 4], [3, 4]])
    expect(boundsOfPath([], [])).toBeNull()
    expect(boundsOfPath(null)).toBeNull()
  })
})

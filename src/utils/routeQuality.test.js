import { describe, expect, it } from 'vitest'
import { validateCalculatedRoutes } from './routeQuality'

const point = (placeId, name, lng, lat) => ({ placeId, name, lng, lat })
const a = point('a', 'A', 100, 30)
const b = point('b', 'B', 100.1, 30.1)
const c = point('c', 'C', 100.2, 30.2)

const segment = (from, to, path, extra = {}) => ({
  fromName: from.name,
  toName: to.name,
  path,
  distance: 20000,
  duration: 1800,
  ...extra,
})

const planOf = (waypoints, segments) => ({ days: [{ dayNumber: 1, waypoints, segments }] })

describe('validateCalculatedRoutes', () => {
  it('拒绝缺失路段和两点直线兜底', () => {
    const issues = validateCalculatedRoutes(planOf([a, b, c], [
      segment(a, b, [[a.lng, a.lat], [b.lng, b.lat]]),
    ]))
    expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'ROUTE_DAY_INCOMPLETE',
      'STRAIGHT_LINE_FALLBACK',
    ]))
    expect(issues.every((issue) => issue.severity === 'error')).toBe(true)
  })

  it('拒绝路线首尾远离指定图钉', () => {
    const issues = validateCalculatedRoutes(planOf([a, b], [
      segment(a, b, [[100.05, 30.05], [100.07, 30.07], [100.08, 30.08]]),
    ]))
    expect(issues).toContainEqual(expect.objectContaining({
      code: 'ROUTE_ENDPOINT_MISMATCH',
      severity: 'error',
      dayNumber: 1,
      segmentIndex: 0,
    }))
  })

  it('只警告很长的异常绕行而不误判为硬错误', () => {
    const closeA = point('close-a', '近点 A', 100, 30)
    const closeB = point('close-b', '近点 B', 100.05, 30)
    const issues = validateCalculatedRoutes(planOf([closeA, closeB], [
      segment(closeA, closeB, [
        [100, 30], [101, 31], [100.05, 30],
      ], { distance: 100000 }),
    ]))
    expect(issues).toContainEqual(expect.objectContaining({
      code: 'SUSPICIOUS_ROUTE_DETOUR',
      severity: 'warning',
    }))
    expect(issues.some((issue) => issue.severity === 'error')).toBe(false)
  })

  it('接受完整、贴合图钉且有道路形状的路线', () => {
    const issues = validateCalculatedRoutes(planOf([a, b], [
      segment(a, b, [[100, 30], [100.05, 30.06], [100.1, 30.1]]),
    ]))
    expect(issues).toEqual([])
  })

  it('对畸形输入返回问题而不是崩溃', () => {
    expect(() => validateCalculatedRoutes(null)).not.toThrow()
    expect(validateCalculatedRoutes(null)).toContainEqual(expect.objectContaining({ code: 'ROUTE_PLAN_MISSING' }))
  })
})

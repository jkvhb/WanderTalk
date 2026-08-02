import { describe, expect, it } from 'vitest'
import { authoritative318 } from '../data/authoritative318'
import { preset318 } from '../data/preset318'
import { validatePlan } from './planValidation'
import { compileAuthoritative318Plan } from './authoritative318Plan'

function catalogFromPreset() {
  return new Map(
    preset318.days.flatMap((day) => day.waypoints).map((point) => [point.placeId, point]),
  )
}

describe('compileAuthoritative318Plan', () => {
  it('存在未解析主线地点时阻止生成路线计划', () => {
    const catalog = catalogFromPreset()
    catalog.delete('kazila-pass')
    const result = compileAuthoritative318Plan({ authority: authoritative318, catalog })
    expect(result.plan).toBeNull()
    expect(result.issues.map((issue) => issue.placeId)).toEqual(['kazila-pass'])
    expect(result.issues[0]).toMatchObject({ code: 'UNRESOLVED_MAIN_PLACE', severity: 'error' })
  })

  it('复用前一天住宿地作为次日起点但不重复讲解', () => {
    const catalog = catalogFromPreset()
    const result = compileAuthoritative318Plan({ authority: authoritative318, catalog })

    expect(result.issues).toEqual([])
    expect(result.plan.days[0].waypoints.at(-1).placeId).toBe('kangding')
    expect(result.plan.days[1].waypoints[0]).toMatchObject({
      placeId: 'kangding',
      narrate: false,
      roles: ['origin', 'route'],
    })
    expect(result.plan.days[1].waypoints[1].placeId).toBe('zheduo-pass')
  })

  it('生成九天、46 个唯一主线地点和 45 个待计算路段', () => {
    const catalog = catalogFromPreset()
    const { plan } = compileAuthoritative318Plan({ authority: authoritative318, catalog })
    const ids = plan.days.flatMap((day) => day.waypoints.map((point) => point.placeId))

    expect(plan.days).toHaveLength(9)
    expect(new Set(ids).size).toBe(46)
    expect(plan.days.reduce((total, day) => total + day.waypoints.length - 1, 0)).toBe(45)
    expect(plan.days.every((day) => day.segments === null)).toBe(true)
    expect(validatePlan(plan)).toEqual([])
  })

  it('把底稿字段附到每个讲解节点并保持可选支线在主线外', () => {
    const catalog = catalogFromPreset()
    const { plan } = compileAuthoritative318Plan({ authority: authoritative318, catalog })
    const yingguanzhai = plan.days[1].waypoints.find((point) => point.placeId === 'yingguanzhai-junction')

    expect(yingguanzhai).toMatchObject({
      name: 'G318/G248交叉口（营官村）',
      lng: 101.5466692,
      lat: 30.038074,
      narrationLevel: 'C',
      narrate: true,
      routeType: 'main',
    })
    expect(yingguanzhai.contentBrief).toContain('默认主线继续向新都桥')
    expect(plan.days[5].alternatives.map((item) => item.placeId)).toContain('laigu-glacier')
    expect(plan.days.flatMap((day) => day.waypoints).some((point) => point.placeId === 'laigu-glacier')).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { validatePlan, validatePlanForGeneration } from './planValidation'

const wp = (placeId, name, lng, lat, extra = {}) => ({
  placeId,
  name,
  lng,
  lat,
  narrate: true,
  roles: ['stop'],
  routeType: 'main',
  ...extra,
})

const validPlan = {
  days: [
    {
      dayNumber: 1,
      waypoints: [
        wp('a', 'A', 100, 30),
        wp('b', 'B', 101, 30, { roles: ['stop', 'overnight'] }),
      ],
      overnight: 'B',
      overnightPlaceId: 'b',
    },
    {
      dayNumber: 2,
      waypoints: [
        wp('b', 'B', 101, 30, { narrate: false, roles: ['origin'] }),
        wp('c', 'C', 102, 30, { roles: ['stop', 'overnight'] }),
      ],
      overnight: 'C',
      overnightPlaceId: 'c',
    },
  ],
}

const clonePlan = () => structuredClone(validPlan)
const issueCodes = (plan) => validatePlan(plan).map((issue) => issue.code)

describe('validatePlan', () => {
  it('有效计划返回空问题列表，跨日首尾共享地点不算重复', () => {
    expect(validatePlan(clonePlan())).toEqual([])
  })

  it('错误的天数编号产生稳定定位的 DUPLICATE_DAY_NUMBER', () => {
    const plan = clonePlan()
    plan.days[1].dayNumber = '1'

    const issue = validatePlan(plan).find((item) => item.code === 'DUPLICATE_DAY_NUMBER')
    expect(issue).toEqual(expect.objectContaining({ dayNumber: 2 }))
  })

  it('非法坐标产生 INVALID_COORDINATE，并返回稳定的问题对象形状', () => {
    const plan = clonePlan()
    plan.days[0].waypoints[0].lng = 181

    const issues = validatePlan(plan)
    expect(issues.map((issue) => issue.code)).toContain('INVALID_COORDINATE')
    expect(issues.find((issue) => issue.code === 'INVALID_COORDINATE')).toEqual(
      expect.objectContaining({
        code: 'INVALID_COORDINATE',
        severity: 'error',
        dayNumber: 1,
        waypointIndex: 0,
        message: expect.any(String),
      }),
    )
  })

  it('住宿 placeId 与当天终点不匹配时产生 OVERNIGHT_MISMATCH', () => {
    const plan = clonePlan()
    plan.days[0].overnightPlaceId = 'not-b'
    expect(issueCodes(plan)).toContain('OVERNIGHT_MISMATCH')
  })

  it('住宿 placeId 不强制转换非字符串值', () => {
    const plan = clonePlan()
    plan.days[0].waypoints.at(-1).placeId = 123
    plan.days[0].overnightPlaceId = '123'
    expect(issueCodes(plan)).toContain('OVERNIGHT_MISMATCH')
  })

  it('只有一个 waypoint 的日期产生 EMPTY_DAY', () => {
    const plan = clonePlan()
    plan.days[0].waypoints = [plan.days[0].waypoints[0]]
    expect(issueCodes(plan)).toContain('EMPTY_DAY')
  })

  it('同日重复插入两个都讲解的 A 时报告地点、讲解和零距离重复', () => {
    const plan = clonePlan()
    plan.days[0].waypoints[0].narration = '第一次讲解 A'
    plan.days[0].waypoints.splice(
      1,
      0,
      wp('a', 'A', 100, 30, { narration: '第二次讲解 A' }),
    )

    const codes = issueCodes(plan)
    expect(codes).toContain('DUPLICATE_PLACE')
    expect(codes).toContain('DUPLICATE_NARRATION')
    expect(codes).toContain('ZERO_DISTANCE_LEG')
  })

  it('按相邻讲解事件检测重复，并忽略非字符串 narration', () => {
    const narrated = clonePlan()
    narrated.days[0].waypoints = [
      wp('a', 'A', 100, 30, { narration: '第一次讲解 A' }),
      wp('x', 'X', 100.5, 30, { narrate: false }),
      wp('a', 'A', 100, 30, { narration: '第二次讲解 A' }),
    ]
    narrated.days[0].overnight = 'A'
    narrated.days[0].overnightPlaceId = 'a'
    expect(issueCodes(narrated)).toContain('DUPLICATE_NARRATION')

    const malformed = structuredClone(narrated)
    malformed.days[0].waypoints[0].narration = {}
    malformed.days[0].waypoints[2].narration = {}
    expect(issueCodes(malformed)).not.toContain('DUPLICATE_NARRATION')
  })

  it('主路线含 optional 点且跨日边界不同地点时分别报告问题', () => {
    const plan = clonePlan()
    plan.days[0].waypoints[1].routeType = 'optional'
    plan.days[1].waypoints[0] = wp('x', 'X', 103, 30, {
      narrate: false,
      roles: ['origin'],
    })

    const codes = issueCodes(plan)
    expect(codes).toContain('OPTIONAL_IN_MAIN_ROUTE')
    expect(codes).toContain('DAY_BOUNDARY_MISMATCH')
  })

  it('缺少 overnightPlaceId 时回退到标准化住宿名称比较', () => {
    const plan = clonePlan()
    delete plan.days[0].overnightPlaceId
    plan.days[0].overnight = '  B  '
    expect(issueCodes(plan)).not.toContain('OVERNIGHT_MISMATCH')
  })

  it('非法根结构和空计划默认拒绝', () => {
    for (const input of [undefined, null, {}, { days: 'bad' }]) {
      expect(validatePlan(input).map((issue) => issue.code)).toContain('INVALID_PLAN')
    }
    expect(validatePlan({ days: [] }).map((issue) => issue.code)).toContain('EMPTY_PLAN')
  })

  it('waypoints 非数组时产生 EMPTY_DAY 且不级联跨日错误', () => {
    const plan = clonePlan()
    plan.days[0].waypoints = null

    expect(() => validatePlan(plan)).not.toThrow()
    expect(issueCodes(plan)).toContain('EMPTY_DAY')
    expect(issueCodes(plan)).not.toContain('DAY_BOUNDARY_MISMATCH')
  })
})

describe('validatePlanForGeneration', () => {
  it('在内容生成前同时检查规划结构和真实驾驶路线', () => {
    const plan = clonePlan()
    plan.days[0].segments = null
    plan.days[1].segments = null
    const codes = validatePlanForGeneration(plan).map((issue) => issue.code)
    expect(codes).toContain('ROUTE_DAY_INCOMPLETE')
  })
})

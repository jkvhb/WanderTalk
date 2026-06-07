import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTripStore } from './trip'

describe('trip store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('初始无路书', () => {
    const t = useTripStore()
    expect(t.plan).toBeNull()
    expect(t.dayCount).toBe(0)
  })

  it('loadPreset318 后加载 9 天行程', () => {
    const t = useTripStore()
    t.loadPreset318()
    expect(t.plan).not.toBeNull()
    expect(t.dayCount).toBe(9)
    expect(t.plan.name).toContain('318')
  })

  it('allWaypoints 汇总所有节点', () => {
    const t = useTripStore()
    t.loadPreset318()
    expect(t.allWaypoints.length).toBeGreaterThan(20)
    expect(t.allWaypoints[0].name).toContain('成都')
  })

  it('loadPreset318 是深拷贝，修改不影响原始预设', () => {
    const t = useTripStore()
    t.loadPreset318()
    t.plan.days[0].waypoints[0].name = '修改测试'
    t.loadPreset318()
    expect(t.plan.days[0].waypoints[0].name).toContain('成都')
  })
})

import { describe, it, expect } from 'vitest'
import { preset318 } from './preset318'

describe('preset318', () => {
  it('包含 9 天行程', () => {
    expect(preset318.days).toHaveLength(9)
  })

  it('每天都有名称和住宿点', () => {
    for (const day of preset318.days) {
      expect(day.dayNumber).toBeGreaterThan(0)
      expect(day.overnight).toBeTruthy()
      expect(Array.isArray(day.waypoints)).toBe(true)
      expect(day.waypoints.length).toBeGreaterThan(0)
    }
  })

  it('所有 waypoint 坐标在中国西部合理范围内', () => {
    for (const day of preset318.days) {
      for (const wp of day.waypoints) {
        expect(wp.lng).toBeGreaterThan(90)
        expect(wp.lng).toBeLessThan(105)
        expect(wp.lat).toBeGreaterThan(28)
        expect(wp.lat).toBeLessThan(32)
      }
    }
  })

  it('第一天起点是成都，最后一天终点是拉萨', () => {
    const firstDay = preset318.days[0]
    const lastDay = preset318.days[8]
    expect(firstDay.waypoints[0].name).toContain('成都')
    expect(lastDay.waypoints.at(-1).name).toContain('拉萨')
  })
})

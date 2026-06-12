import { describe, it, expect } from 'vitest'
import { gcj02ToWgs84, wgs84ToGcj02, wgs84PathToGcj02, gcj02PathToWgs84 } from './coords'

const CHENGDU = { lng: 104.0665, lat: 30.5728 }

describe('coords', () => {
  it('国内坐标转换产生偏移（50~500m 数量级）', () => {
    const g = wgs84ToGcj02(CHENGDU.lng, CHENGDU.lat)
    const dLng = Math.abs(g.lng - CHENGDU.lng)
    const dLat = Math.abs(g.lat - CHENGDU.lat)
    expect(dLng + dLat).toBeGreaterThan(0.0005)
    expect(dLng + dLat).toBeLessThan(0.02)
  })

  it('round trip 误差小于 1e-4 度', () => {
    const g = wgs84ToGcj02(CHENGDU.lng, CHENGDU.lat)
    const back = gcj02ToWgs84(g.lng, g.lat)
    expect(Math.abs(back.lng - CHENGDU.lng)).toBeLessThan(1e-4)
    expect(Math.abs(back.lat - CHENGDU.lat)).toBeLessThan(1e-4)
  })

  it('境外坐标原样返回', () => {
    const g = wgs84ToGcj02(-122.4194, 37.7749)
    expect(g.lng).toBe(-122.4194)
    expect(g.lat).toBe(37.7749)
  })

  it('路径批量转换保持形状且可逆', () => {
    const path = [[104.0665, 30.5728], [103.001, 29.9877]]
    const gcj = wgs84PathToGcj02(path)
    expect(gcj).toHaveLength(2)
    expect(Array.isArray(gcj[0])).toBe(true)
    const back = gcj02PathToWgs84(gcj)
    expect(back[0][0]).toBeCloseTo(path[0][0], 3)
    expect(back[1][1]).toBeCloseTo(path[1][1], 3)
  })
})

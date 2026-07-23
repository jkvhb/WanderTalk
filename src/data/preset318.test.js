import { describe, it, expect } from 'vitest'
import { preset318 } from './preset318'
import { validatePlan } from '../utils/planValidation'

describe('preset318', () => {
  it('contains nine days', () => {
    expect(preset318.days).toHaveLength(9)
  })

  it('gives every day an identified overnight endpoint', () => {
    for (const day of preset318.days) {
      expect(day.dayNumber).toBeGreaterThan(0)
      expect(day.overnight).toBeTruthy()
      expect(day.overnightPlaceId).toBeTruthy()
      expect(Array.isArray(day.waypoints)).toBe(true)
      expect(day.waypoints.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('keeps all coordinates within the western-China release range', () => {
    for (const day of preset318.days) {
      for (const wp of day.waypoints) {
        expect(wp.lng).toBeGreaterThan(90)
        expect(wp.lng).toBeLessThan(105)
        expect(wp.lat).toBeGreaterThan(28)
        expect(wp.lat).toBeLessThan(32)
      }
    }
  })

  it('follows the approved nine-day main-route identity sequence', () => {
    expect(preset318.days.map((day) => day.waypoints.map((point) => point.placeId))).toEqual([
      ['chengdu', 'yaan', 'tianquan-service', 'erlangshan-tunnel', 'luding', 'kangding'],
      ['kangding', 'zheduo-pass', 'xinduqiao', 'yajiang'],
      ['yajiang', 'tianlu-18-bends', 'jianziwan-pass', 'kazila-pass', 'litang', 'maoya-grassland', 'sister-lakes', 'batang'],
      ['batang', 'jinsha-river-bridge', 'zongbala-pass', 'mangkang', 'lawu-pass', 'rumei', 'jueba-pass', 'dongda-pass', 'zuogong'],
      ['zuogong', 'bangda', 'yela-pass', 'nujiang-72', 'nujiang-bridge', 'basu'],
      ['basu', 'anjiula-pass', 'ranwu-lake', 'midui-glacier', 'bomi'],
      ['bomi', 'guxiang-lake', 'tongmai', 'lulang', 'segrila-pass', 'suosong'],
      ['suosong', 'nyingchi', 'basongtso', 'gongbo-gyamda'],
      ['gongbo-gyamda', 'mila-pass', 'mozhugongka', 'lhasa'],
    ])
    expect(preset318.days.slice(1).every((day) => day.waypoints[0].narrate === false)).toBe(true)
  })

  it('passes the release validator and permits one showcase occurrence of litang and midui', () => {
    expect(validatePlan(preset318)).toEqual([])
    const showcasePoints = preset318.days.flatMap((day) => day.waypoints)
      .filter((point) => point.narrate !== false)
    expect(showcasePoints.filter((point) => point.placeId === 'litang')).toHaveLength(1)
    expect(showcasePoints.filter((point) => point.placeId === 'midui-glacier')).toHaveLength(1)
  })

  it('keeps an auditable AMap result and the normalized coordinate for each main point', () => {
    for (const point of preset318.days.flatMap((day) => day.waypoints)) {
      expect(point.placeId).toBeTruthy()
      expect(point.source).toMatchObject({ provider: 'amap-web-service', coordinateSystem: 'WGS-84' })
      expect(Number.isFinite(point.source.gcj02?.lng)).toBe(true)
      expect(Number.isFinite(point.source.gcj02?.lat)).toBe(true)
    }
  })
})

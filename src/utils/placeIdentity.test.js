import { describe, expect, it } from 'vitest'
import {
  isValidPlaceCoordinate,
  normalizePlaceName,
  placeDistance,
  samePlace,
} from './placeIdentity'

describe('normalizePlaceName', () => {
  it('规范化空白、标点、全角字符和大小写', () => {
    expect(normalizePlaceName(' 怒江 72 拐 ')).toBe('怒江72拐')
    expect(normalizePlaceName('怒江·72（拐）')).toBe('怒江72拐')
    expect(normalizePlaceName(' ＡＢＣ－１２３ ')).toBe('abc123')
  })

  it('不会把不同长度的名称误判为相同地点', () => {
    expect(normalizePlaceName('鲁朗林海')).not.toBe(normalizePlaceName('鲁朗'))
  })
})

describe('samePlace', () => {
  it('有效 placeId 相同时优先判定为同一地点', () => {
    expect(
      samePlace(
        { placeId: 'nujiang-72', name: '怒江七十二拐', lng: Number.NaN, lat: 30 },
        { placeId: 'nujiang-72', name: '怒江72拐', lng: 100, lat: Number.NaN },
      ),
    ).toBe(true)
  })

  it('空白 placeId 不具备权威性', () => {
    expect(samePlace({ placeId: ' ', name: '甲地' }, { placeId: ' ', name: '乙地' })).toBe(
      false,
    )
  })

  it('名称标准化后按 1 公里阈值判定内外两侧', () => {
    expect(
      samePlace(
        { name: '怒江 72 拐', lng: 0, lat: 0 },
        { name: '怒江72拐', lng: 0.0089, lat: 0 },
      ),
    ).toBe(true)
    expect(
      samePlace(
        { name: '怒江 72 拐', lng: 0, lat: 0 },
        { name: '怒江72拐', lng: 0.0091, lat: 0 },
      ),
    ).toBe(false)
  })

  it('同名但跨城市时不判定为同一地点', () => {
    expect(
      samePlace(
        { name: '人民公园', lng: 91.1322, lat: 29.6604 },
        { name: '人民公园', lng: 104.0665, lat: 30.5723 },
      ),
    ).toBe(false)
  })

  it('按 50 米坐标阈值判定内外两侧', () => {
    expect(
      samePlace(
        { placeId: 'place-a', name: '甲地', lng: 0, lat: 0 },
        { placeId: 'place-b', name: '乙地', lng: 0.00044, lat: 0 },
      ),
    ).toBe(true)
    expect(
      samePlace(
        { placeId: 'place-a', name: '甲地', lng: 0, lat: 0 },
        { placeId: 'place-b', name: '乙地', lng: 0.00046, lat: 0 },
      ),
    ).toBe(false)
  })

  it('无效阈值不会启用匹配规则', () => {
    expect(
      samePlace(
        { name: '理塘' },
        { name: '理塘' },
        { sameNameMeters: Number.POSITIVE_INFINITY },
      ),
    ).toBe(false)
    expect(
      samePlace(
        { name: '甲地', lng: 0, lat: 0 },
        { name: '乙地', lng: 1, lat: 0 },
        { sameCoordinateMeters: '200000' },
      ),
    ).toBe(false)
    expect(
      samePlace(
        { name: '理塘', lng: 0, lat: 0 },
        { name: '理塘', lng: 0.001, lat: 0 },
        { sameNameMeters: -1, sameCoordinateMeters: -1 },
      ),
    ).toBe(false)
  })
})

describe('isValidPlaceCoordinate', () => {
  it('接受合法坐标和闭区间边界', () => {
    expect(isValidPlaceCoordinate({ lng: 120.1, lat: 30.2 })).toBe(true)
    expect(isValidPlaceCoordinate({ lng: -180, lat: -90 })).toBe(true)
    expect(isValidPlaceCoordinate({ lng: 180, lat: 90 })).toBe(true)
  })

  it('拒绝缺失坐标', () => {
    expect(isValidPlaceCoordinate()).toBe(false)
    expect(isValidPlaceCoordinate({ lat: 30 })).toBe(false)
    expect(isValidPlaceCoordinate({ lng: 120 })).toBe(false)
  })

  it('拒绝 NaN 和 Infinity 坐标', () => {
    expect(isValidPlaceCoordinate({ lng: Number.NaN, lat: 30 })).toBe(false)
    expect(isValidPlaceCoordinate({ lng: 120, lat: Number.NaN })).toBe(false)
    expect(isValidPlaceCoordinate({ lng: Number.POSITIVE_INFINITY, lat: 30 })).toBe(false)
    expect(isValidPlaceCoordinate({ lng: 120, lat: Number.NEGATIVE_INFINITY })).toBe(false)
  })

  it.each([
    [{ lng: -180.0001, lat: 0 }, '经度小于 -180'],
    [{ lng: 180.0001, lat: 0 }, '经度大于 180'],
    [{ lng: 0, lat: -90.0001 }, '纬度小于 -90'],
    [{ lng: 0, lat: 90.0001 }, '纬度大于 90'],
  ])('拒绝越界坐标：%s（%s）', (place) => {
    expect(isValidPlaceCoordinate(place)).toBe(false)
  })
})

describe('placeDistance', () => {
  it('任一坐标无效时返回 Infinity', () => {
    expect(placeDistance({ lng: 120, lat: 30 }, { lng: Number.NaN, lat: 30 })).toBe(
      Number.POSITIVE_INFINITY,
    )
  })

  it('使用米作为距离单位', () => {
    expect(placeDistance({ lng: 0, lat: 0 }, { lng: 0.001, lat: 0 })).toBeCloseTo(111.2, 0)
  })
})

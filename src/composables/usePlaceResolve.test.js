import { describe, expect, it } from 'vitest'
import { choosePlaceCandidate, resolvePlaceByText } from './usePlaceResolve'

function fakeAMapReturning(pois, status = 'complete') {
  class PlaceSearch {
    constructor(options) {
      this.options = options
    }

    search(query, callback) {
      callback(status, { poiList: { pois }, query, options: this.options })
    }
  }
  return { PlaceSearch }
}

const nimagongRequest = {
  query: '尼玛贡神山大型观景台旅游服务区',
  city: '理塘县',
  aliases: ['尼玛贡神山'],
  regionHints: ['理塘', '甘孜'],
}

describe('choosePlaceCandidate', () => {
  it('名称和预期地区都匹配时才选中候选地点', () => {
    const result = choosePlaceCandidate([
      { name: '尼玛贡神山大型观景台旅游服务区', address: '甘孜州理塘县', location: { lng: 100.7, lat: 30.1 } },
      { name: '尼玛山', address: '云南省', location: { lng: 101, lat: 25 } },
    ], nimagongRequest)
    expect(result.name).toContain('尼玛贡神山')
  })

  it('没有匹配地点时给出明确错误', () => {
    expect(() => choosePlaceCandidate([
      { name: '尼玛贡神山观景台', address: '云南省', location: { lng: 101, lat: 25 } },
    ], nimagongRequest)).toThrow('没有找到符合名称和地区的地点')
  })

  it('多个候选都符合时停止并要求人工确认', () => {
    expect(() => choosePlaceCandidate([
      { name: '营官村', address: '康定市新都桥镇', location: { lng: 1, lat: 1 } },
      { name: '营官寨', address: '康定市新都桥镇', location: { lng: 2, lat: 2 } },
    ], { aliases: ['营官'], regionHints: ['康定', '新都桥'] })).toThrow('找到多个可能地点')
  })
})

describe('resolvePlaceByText', () => {
  it('把高德坐标转换为 WGS-84 并保留检索证据', async () => {
    const AMap = fakeAMapReturning([{
      name: '尼玛贡神山大型观景台旅游服务区',
      address: '甘孜州理塘县',
      location: { lng: 100.7, lat: 30.1 },
    }])

    const result = await resolvePlaceByText(AMap, nimagongRequest, {
      now: () => '2026-08-02T00:00:00.000Z',
    })

    expect(result).toMatchObject({
      name: '尼玛贡神山大型观景台旅游服务区',
      address: '甘孜州理塘县',
      coordinateSystem: 'WGS-84',
      source: {
        provider: 'amap-js-place-search',
        query: nimagongRequest.query,
        resultName: '尼玛贡神山大型观景台旅游服务区',
        address: '甘孜州理塘县',
        gcj02: { lng: 100.7, lat: 30.1 },
        checkedAt: '2026-08-02T00:00:00.000Z',
      },
    })
    expect(result.lng).not.toBe(100.7)
    expect(result.lat).not.toBe(30.1)
  })

  it('高德检索失败时不返回伪造地点', async () => {
    const AMap = fakeAMapReturning([], 'error')
    await expect(resolvePlaceByText(AMap, nimagongRequest)).rejects.toThrow('高德地点搜索失败')
  })
})

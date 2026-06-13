import { describe, it, expect } from 'vitest'
import { searchNearbyPoi } from './useNearby'

function makeFakeAMap(impl) {
  let lastArgs = null
  class PlaceSearch {
    searchNearBy(keyword, center, radius, cb) {
      lastArgs = { keyword, center, radius }
      impl(cb)
    }
  }
  return { AMap: { PlaceSearch }, getLastArgs: () => lastArgs }
}

describe('searchNearbyPoi', () => {
  it('返回最近 POI 的名称/地址/坐标', async () => {
    const { AMap, getLastArgs } = makeFakeAMap((cb) => {
      cb('complete', {
        poiList: {
          pois: [
            { name: '世纪城地铁站', address: '成都市', location: { lng: 104.066, lat: 30.572 } },
          ],
        },
      })
    })
    const poi = await searchNearbyPoi(AMap, 104.066, 30.572, 150)
    expect(poi.name).toBe('世纪城地铁站')
    expect(poi.lng).toBe(104.066)
    expect(getLastArgs().radius).toBe(150)
    expect(getLastArgs().center).toEqual([104.066, 30.572])
  })

  it('no_data 抛出"附近没有找到地点"', async () => {
    const { AMap } = makeFakeAMap((cb) => cb('no_data', {}))
    await expect(searchNearbyPoi(AMap, 1, 1)).rejects.toThrow('附近没有找到地点')
  })

  it('失败时抛出可读错误而非 [object Event]', async () => {
    const { AMap } = makeFakeAMap((cb) => cb('error', new Event('error')))
    await expect(searchNearbyPoi(AMap, 1, 1)).rejects.toThrow(/安全密钥|网络/)
  })
})

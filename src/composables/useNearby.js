import { amapErrorMessage } from '../utils/amapError'

// 在 (lng,lat)（GCJ-02，即高德地图坐标）附近搜索最近的 POI。
// 返回 { name, address, lng, lat }，坐标仍为 GCJ-02，由调用方转 WGS-84 入库。
export function searchNearbyPoi(AMap, lng, lat, radius = 200) {
  return new Promise((resolve, reject) => {
    const ps = new AMap.PlaceSearch({ pageSize: 1, pageIndex: 1 })
    ps.searchNearBy('', [lng, lat], radius, (status, result) => {
      if (status === 'complete' && result.poiList?.pois?.length) {
        const p = result.poiList.pois[0]
        resolve({
          name: p.name,
          address: p.address || '',
          lng: p.location.lng,
          lat: p.location.lat,
        })
      } else if (status === 'no_data') {
        reject(new Error('附近没有找到地点，换个位置再点'))
      } else {
        reject(new Error(amapErrorMessage(status, result)))
      }
    })
  })
}

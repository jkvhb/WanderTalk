import { gcj02ToWgs84 } from '../utils/coords'

function searchableRegion(poi) {
  return [poi?.address, poi?.pname, poi?.cityname, poi?.adname]
    .flat()
    .filter(Boolean)
    .join(' ')
}

export function choosePlaceCandidate(pois, { aliases = [], regionHints = [] }) {
  const matches = (pois || []).filter((poi) => {
    const name = String(poi?.name || '')
    const region = searchableRegion(poi)
    return aliases.some((alias) => name.includes(alias))
      && regionHints.some((hint) => region.includes(hint))
  })

  if (matches.length === 0) throw new Error('没有找到符合名称和地区的地点')
  if (matches.length > 1) throw new Error('找到多个可能地点，需要人工确认')
  return matches[0]
}

function coordinateOf(location) {
  const lng = Number(location?.lng ?? location?.getLng?.())
  const lat = Number(location?.lat ?? location?.getLat?.())
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    throw new Error('高德地点缺少有效坐标')
  }
  return { lng, lat }
}

function searchOnce(AMap, request, query) {
  return new Promise((resolve, reject) => {
    const search = new AMap.PlaceSearch({
      pageSize: 10,
      pageIndex: 1,
      city: request.city,
      citylimit: false,
    })

    search.search(query, (status, result) => {
      if (status === 'no_data') {
        resolve(null)
        return
      }
      if (status !== 'complete') {
        reject(new Error('高德地点搜索失败'))
        return
      }

      try {
        const poi = choosePlaceCandidate(result?.poiList?.pois, request)
        resolve(poi)
      } catch (error) {
        if (error.message === '没有找到符合名称和地区的地点') resolve(null)
        else reject(error)
      }
    })
  })
}

export async function resolvePlaceByText(AMap, request, { now = () => new Date().toISOString() } = {}) {
  const queries = request.queries?.length ? request.queries : [request.query].filter(Boolean)
  for (const query of queries) {
    const poi = await searchOnce(AMap, request, query)
    if (!poi) continue
    const gcj02 = coordinateOf(poi.location)
    const wgs84 = gcj02ToWgs84(gcj02.lng, gcj02.lat)
    const address = Array.isArray(poi.address) ? poi.address.join(' ') : String(poi.address || '')
    return {
      name: poi.name,
      address,
      lng: wgs84.lng,
      lat: wgs84.lat,
      coordinateSystem: 'WGS-84',
      source: {
        provider: 'amap-js-place-search',
        query,
        resultName: poi.name,
        address,
        gcj02,
        checkedAt: now(),
      },
    }
  }
  throw new Error('没有找到符合名称和地区的地点')
}

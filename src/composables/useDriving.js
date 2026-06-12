import { wgs84ToGcj02, gcj02PathToWgs84 } from '../utils/coords'
import { getCachedRoute, setCachedRoute } from '../utils/db'

// 缓存 key：WGS-84 坐标保留 5 位小数（约 1m 精度）
export function routeCacheKey(from, to) {
  return `${from.lng.toFixed(5)},${from.lat.toFixed(5)}>${to.lng.toFixed(5)},${to.lat.toFixed(5)}`
}

function searchDriving(AMap, origin, destination) {
  return new Promise((resolve, reject) => {
    const driving = new AMap.Driving()
    driving.search(origin, destination, (status, result) => {
      if (status === 'complete' && result.routes?.length) {
        resolve(result.routes[0])
      } else {
        const info = typeof result === 'string' ? result : result?.info || status
        reject(new Error(info || '驾车路线查询失败'))
      }
    })
  })
}

// from/to 为 WGS-84 waypoint；返回 { path: [[lng,lat]...](WGS-84), distance: 米, duration: 秒 }。
// 结果写入 IndexedDB 缓存；失败等 1 秒自动重试一次（应对限流）。
export async function planDrivingRoute(AMap, from, to) {
  const key = routeCacheKey(from, to)
  const cached = await getCachedRoute(key)
  if (cached) return cached

  const o = wgs84ToGcj02(from.lng, from.lat)
  const d = wgs84ToGcj02(to.lng, to.lat)
  const origin = [o.lng, o.lat]
  const destination = [d.lng, d.lat]

  let route0
  try {
    route0 = await searchDriving(AMap, origin, destination)
  } catch {
    await new Promise((r) => setTimeout(r, 1000))
    route0 = await searchDriving(AMap, origin, destination)
  }

  // steps[].path 元素在 JSAPI 2.0 中是 LngLat 对象（{lng, lat}），兼容数组形式
  const gcjPath = route0.steps
    .flatMap((s) => s.path || [])
    .map((p) => (Array.isArray(p) ? p : [p.lng, p.lat]))

  const route = {
    path: gcj02PathToWgs84(gcjPath),
    distance: route0.distance,
    duration: route0.time,
  }
  await setCachedRoute(key, route)
  return route
}

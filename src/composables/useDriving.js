import { wgs84ToGcj02, gcj02PathToWgs84 } from '../utils/coords'
import { getCachedRoute, setCachedRoute } from '../utils/db'
import { amapErrorMessage } from '../utils/amapError'

const ROUTE_CACHE_VERSION = 2
const ROUTE_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

// 缓存 key：WGS-84 坐标保留 5 位小数（约 1m 精度）
export function routeCacheKey(from, to) {
  return `route-v2:${from.lng.toFixed(5)},${from.lat.toFixed(5)}>${to.lng.toFixed(5)},${to.lat.toFixed(5)}`
}

function validPath(path) {
  return (
    Array.isArray(path) &&
    path.length >= 2 &&
    path.every(
      (point) =>
        Array.isArray(point) &&
        Number.isFinite(point[0]) &&
        Number.isFinite(point[1]),
    )
  )
}

function publicRoute(entry) {
  return {
    path: entry.path.map((point) => [point[0], point[1]]),
    distance: entry.distance,
    duration: entry.duration,
  }
}

function freshCachedRoute(entry, now = Date.now()) {
  return (
    entry?.cacheVersion === ROUTE_CACHE_VERSION &&
    Number.isFinite(entry.cachedAt) &&
    now - entry.cachedAt <= ROUTE_CACHE_MAX_AGE_MS &&
    validPath(entry.path)
  )
}

function searchDriving(AMap, origin, destination) {
  return new Promise((resolve, reject) => {
    const driving = new AMap.Driving()
    driving.search(origin, destination, (status, result) => {
      if (status === 'complete' && result.routes?.length) {
        resolve(result.routes[0])
      } else {
        reject(new Error(amapErrorMessage(status, result)))
      }
    })
  })
}

// from/to 为 WGS-84 waypoint；返回 { path: [[lng,lat]...](WGS-84), distance: 米, duration: 秒 }。
// 结果写入 IndexedDB 缓存；失败等 1 秒自动重试一次（应对限流）。
export async function planDrivingRoute(AMap, from, to, options = {}) {
  const key = routeCacheKey(from, to)
  const cached = await getCachedRoute(key)
  if (freshCachedRoute(cached) && !options.forceRefresh) return publicRoute(cached)

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
  const gcjPath = (route0.steps || [])
    .flatMap((s) => s.path || [])
    .map((p) => (Array.isArray(p) ? p : [p.lng, p.lat]))

  const route = {
    path: gcj02PathToWgs84(gcjPath),
    distance: route0.distance,
    duration: route0.time,
  }
  if (!validPath(route.path)) {
    throw new Error('高德返回的驾驶路线缺少有效轨迹，请稍后重新计算')
  }
  await setCachedRoute(key, {
    ...route,
    cacheVersion: ROUTE_CACHE_VERSION,
    cachedAt: Date.now(),
  })
  return route
}

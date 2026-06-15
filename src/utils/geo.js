import { clamp01 } from './easing'

const R = 6371000 // 地球半径（米）
const toRad = (d) => (d * Math.PI) / 180

// 两点 [lng,lat] 间的大圆距离（米）
export function haversine([lng1, lat1], [lng2, lat2]) {
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

// 折线总长（米）
export function pathLength(path) {
  if (!path || path.length < 2) return 0
  let sum = 0
  for (let i = 0; i < path.length - 1; i++) sum += haversine(path[i], path[i + 1])
  return sum
}

// 按弧长比例 frac∈[0,1] 在折线上线性插值取点，返回 [lng,lat]
export function pointAlongPath(path, frac) {
  if (!path || path.length === 0) return null
  if (path.length === 1) return path[0]
  const total = pathLength(path)
  if (total === 0) return path[0]
  const target = clamp01(frac) * total
  let acc = 0
  for (let i = 0; i < path.length - 1; i++) {
    const segLen = haversine(path[i], path[i + 1])
    if (acc + segLen >= target) {
      const t = segLen === 0 ? 0 : (target - acc) / segLen
      return [
        path[i][0] + (path[i + 1][0] - path[i][0]) * t,
        path[i][1] + (path[i + 1][1] - path[i][1]) * t,
      ]
    }
    acc += segLen
  }
  return path[path.length - 1]
}

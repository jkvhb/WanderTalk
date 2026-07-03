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

// 两点方位角：0=正北，顺时针 0~360
export function bearingBetween([lng1, lat1], [lng2, lat2]) {
  const f1 = toRad(lat1)
  const f2 = toRad(lat2)
  const dl = toRad(lng2 - lng1)
  const y = Math.sin(dl) * Math.cos(f2)
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

// 路径 frac 处的行进方位：取该点与前方 lookaheadM 处点的方位角。
// 前瞻窗口本身即低通滤波；窗口越过终点时整体回退，保证不越界。
export function bearingAt(path, frac, lookaheadM = 2000) {
  if (!path || path.length < 2) return 0
  const total = pathLength(path)
  if (total === 0) return 0
  const w = Math.min(lookaheadM / total, 1)
  let f0 = clamp01(frac)
  let f1 = f0 + w
  if (f1 > 1) {
    f0 = Math.max(0, 1 - w)
    f1 = 1
  }
  return bearingBetween(pointAlongPath(path, f0), pointAlongPath(path, f1))
}

// 角度按最短弧插值（正确处理跨 0°），返回 [0,360)
export function lerpAngle(a, b, t) {
  const raw = ((b - a) % 360 + 360) % 360 // [0,360)
  const diff = raw > 180 ? raw - 360 : raw  // 差角归一到 [-180,180]，恰好 180° 时取正方向弧（0→180 走 90 一侧）
  return (((a + diff * clamp01(t)) % 360) + 360) % 360
}

// 按弧长等距重采样：输出相邻点距≈step 的折线，首尾保持。
// 目的：控制点数（性能）并让 pointAlongPath 的 frac 推进对应匀速前进。
// 用累计弧长表单趟插值（O(n)），避免逐点调 pointAlongPath 反复重算 pathLength（O(n²)）。
export function resampleByDistance(path, step) {
  if (!path || path.length < 2 || !(step > 0)) return path ? [...path] : []
  const cum = [0]
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + haversine(path[i - 1], path[i]))
  const total = cum[cum.length - 1]
  if (total === 0) return [path[0], path[path.length - 1]]
  const n = Math.max(1, Math.round(total / step))
  const out = []
  let seg = 0
  for (let i = 0; i <= n; i++) {
    const target = (i / n) * total
    while (seg < path.length - 2 && cum[seg + 1] < target) seg++
    const segLen = cum[seg + 1] - cum[seg]
    const t = segLen === 0 ? 0 : (target - cum[seg]) / segLen
    out.push([
      path[seg][0] + (path[seg + 1][0] - path[seg][0]) * t,
      path[seg][1] + (path[seg + 1][1] - path[seg][1]) * t,
    ])
  }
  out[0] = [...path[0]]
  out[out.length - 1] = [...path[path.length - 1]]
  return out
}

// Chaikin 切角平滑：每条边取 1/4、3/4 两点替代原顶点，保留首尾端点。
// 相机中心走它而非原始驾车折线，消除发卡弯逐顶点抖动。经纬度小范围内线性插值足够。
export function chaikinSmooth(path, iterations = 2) {
  if (!path || path.length < 3) return path ? [...path] : []
  let pts = path
  for (let k = 0; k < iterations; k++) {
    const out = [pts[0]]
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i]
      const [bx, by] = pts[i + 1]
      out.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25])
      out.push([ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75])
    }
    out.push(pts[pts.length - 1])
    pts = out
  }
  return pts === path ? [...path] : pts
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

import { haversine } from './geo'

const ENDPOINT_LIMIT_M = 2000
const DETOUR_RATIO = 8
const DETOUR_MIN_M = 80000

function issue(code, severity, day, segmentIndex, message) {
  return {
    code,
    severity,
    dayNumber: day?.dayNumber ?? 0,
    segmentIndex,
    message,
  }
}

function coordinateOf(point) {
  const lng = Number(point?.lng)
  const lat = Number(point?.lat)
  return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null
}

function pathCoordinate(point) {
  if (!Array.isArray(point) || point.length < 2) return null
  const lng = Number(point[0])
  const lat = Number(point[1])
  return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null
}

export function validateCalculatedRoutes(plan) {
  if (!plan || !Array.isArray(plan.days)) {
    return [issue('ROUTE_PLAN_MISSING', 'error', null, -1, '没有可校验的路线计划')]
  }

  const issues = []
  for (const day of plan.days) {
    const waypoints = Array.isArray(day?.waypoints) ? day.waypoints : []
    const segments = Array.isArray(day?.segments) ? day.segments : []
    const expected = Math.max(0, waypoints.length - 1)

    if (segments.length !== expected) {
      issues.push(issue(
        'ROUTE_DAY_INCOMPLETE',
        'error',
        day,
        -1,
        `Day ${day?.dayNumber ?? '?'} 驾驶路线不完整：需要 ${expected} 段，当前 ${segments.length} 段`,
      ))
    }

    segments.forEach((segment, segmentIndex) => {
      const path = Array.isArray(segment?.path) ? segment.path : []
      const from = coordinateOf(waypoints[segmentIndex])
      const to = coordinateOf(waypoints[segmentIndex + 1])

      if (path.length < 3) {
        issues.push(issue(
          'STRAIGHT_LINE_FALLBACK',
          'error',
          day,
          segmentIndex,
          `Day ${day?.dayNumber ?? '?'} ${segment?.fromName || '起点'} → ${segment?.toName || '终点'} 缺少真实道路形状`,
        ))
      }

      const pathStart = pathCoordinate(path[0])
      const pathEnd = pathCoordinate(path.at(-1))
      if (from && to && pathStart && pathEnd) {
        const startOffset = haversine(from, pathStart)
        const endOffset = haversine(to, pathEnd)
        if (startOffset > ENDPOINT_LIMIT_M || endOffset > ENDPOINT_LIMIT_M) {
          issues.push(issue(
            'ROUTE_ENDPOINT_MISMATCH',
            'error',
            day,
            segmentIndex,
            `Day ${day?.dayNumber ?? '?'} ${waypoints[segmentIndex]?.name || '起点'} → ${waypoints[segmentIndex + 1]?.name || '终点'} 的道路与图钉偏离超过 2 公里`,
          ))
        }

        const directDistance = haversine(from, to)
        const routeDistance = Number(segment?.distance)
        if (
          directDistance > 0
          && Number.isFinite(routeDistance)
          && routeDistance > DETOUR_MIN_M
          && routeDistance / directDistance > DETOUR_RATIO
        ) {
          issues.push(issue(
            'SUSPICIOUS_ROUTE_DETOUR',
            'warning',
            day,
            segmentIndex,
            `Day ${day?.dayNumber ?? '?'} ${waypoints[segmentIndex]?.name || '起点'} → ${waypoints[segmentIndex + 1]?.name || '终点'} 可能存在异常绕行`,
          ))
        }
      }
    })
  }
  return issues
}

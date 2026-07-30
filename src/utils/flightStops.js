import { haversine } from './geo'
import { samePlace } from './placeIdentity'
import { isContentNode } from './contentNode'

const LEG_ENDPOINT_TOLERANCE_METERS = 5000
const DUPLICATE_TRAVEL_TOLERANCE_METERS = 50

function sameCoordinate(a, b) {
  return (
    a &&
    b &&
    Math.abs(a[0] - b[0]) < 1e-9 &&
    Math.abs(a[1] - b[1]) < 1e-9
  )
}

function validCoordinate(value) {
  return (
    Array.isArray(value) &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  )
}

function coordinateOf(waypoint) {
  const coordinate = [waypoint?.lng, waypoint?.lat]
  return validCoordinate(coordinate) ? coordinate : null
}

function appendPath(target, path) {
  for (const coordinate of path || []) {
    if (!validCoordinate(coordinate)) continue
    if (!sameCoordinate(target.at(-1), coordinate)) {
      target.push([coordinate[0], coordinate[1]])
    }
  }
  return target
}

function directLeg(from, to) {
  const start = coordinateOf(from)
  const end = coordinateOf(to)
  return start && end ? [start, end] : []
}

function normalizeLegPath(path, from, to) {
  const fallback = directLeg(from, to)
  if (!Array.isArray(path) || path.length < 2 || path.some((point) => !validCoordinate(point))) {
    return []
  }

  const start = fallback[0]
  const end = fallback[1]
  if (!start || !end) return []

  let normalized = path.map((point) => [point[0], point[1]])
  const forwardError =
    haversine(normalized[0], start) + haversine(normalized.at(-1), end)
  const reverseError =
    haversine(normalized.at(-1), start) + haversine(normalized[0], end)
  if (reverseError < forwardError) normalized.reverse()

  if (
    haversine(normalized[0], start) > LEG_ENDPOINT_TOLERANCE_METERS ||
    haversine(normalized.at(-1), end) > LEG_ENDPOINT_TOLERANCE_METERS
  ) {
    return []
  }

  if (!sameCoordinate(normalized[0], start)) normalized.unshift(start)
  if (!sameCoordinate(normalized.at(-1), end)) normalized.push(end)
  return normalized
}

function segmentForLeg(day, index, from, to) {
  const segments = Array.isArray(day?.segments) ? day.segments : []
  const fromName = from?.name
  const toName = to?.name
  const named = segments.find((segment) => (
    (segment?.fromName === fromName && segment?.toName === toName) ||
    (segment?.fromName === toName && segment?.toName === fromName)
  ))
  if (named) return named

  const indexed = segments[index]
  if (!indexed?.fromName && !indexed?.toName) return indexed ?? null
  return null
}

export function findFlightRouteIssues(plan) {
  if (!Array.isArray(plan?.days)) return []
  const issues = []
  for (const day of plan.days) {
    const waypoints = Array.isArray(day?.waypoints) ? day.waypoints : []
    for (let index = 0; index < waypoints.length - 1; index += 1) {
      const segment = segmentForLeg(
        day,
        index,
        waypoints[index],
        waypoints[index + 1],
      )
      if (!Array.isArray(segment?.path) || segment.path.length < 2) {
        issues.push({
          dayNumber: day.dayNumber,
          fromName: waypoints[index]?.name ?? '',
          toName: waypoints[index + 1]?.name ?? '',
          reason: 'missing',
        })
      } else if (segment.path.some((point) => !validCoordinate(point))) {
        issues.push({
          dayNumber: day.dayNumber,
          fromName: waypoints[index]?.name ?? '',
          toName: waypoints[index + 1]?.name ?? '',
          reason: 'invalid',
        })
      } else if (
        normalizeLegPath(
          segment.path,
          waypoints[index],
          waypoints[index + 1],
        ).length < 2
      ) {
        issues.push({
          dayNumber: day.dayNumber,
          fromName: waypoints[index]?.name ?? '',
          toName: waypoints[index + 1]?.name ?? '',
          reason: 'disconnected',
        })
      }
    }
  }
  return issues
}

function routeDistance(path) {
  let total = 0
  for (let i = 1; i < path.length; i += 1) {
    total += haversine(path[i - 1], path[i])
  }
  return total
}

function hasUsablePlaceId(value) {
  return typeof value === 'string' && value.trim() !== ''
}

function sameNarratedPlace(a, b) {
  if (hasUsablePlaceId(a?.placeId) && hasUsablePlaceId(b?.placeId)) {
    return a.placeId === b.placeId
  }
  return samePlace(a, b)
}

function hasNarration(node) {
  return typeof node?.narration === 'string' && node.narration.trim() !== ''
}

function cloneData(value) {
  if (Array.isArray(value)) return value.map(cloneData)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, cloneData(entry)]),
  )
}

// 把 plan 里所有「有旁白」的节点按全局顺序收集成 stops。
// routeToHere = 上一个有旁白节点 → 当前节点之间、串联沿途各 leg 的折线。
// 每个 leg 只接受已计算的真实驾驶折线；优先按起终点名称找段，兼容旧数据中的段顺序错位。
// 缺失、坏坐标或与端点断裂时返回空路径，由预览入口提示用户重算，绝不伪造两点直线。
export function collectNarratedStops(plan) {
  if (!Array.isArray(plan?.days)) return []

  const flat = []
  plan.days.forEach((day) => {
    const waypoints = Array.isArray(day?.waypoints) ? day.waypoints : []
    waypoints.forEach((wp, i) => flat.push({ wp, day, i }))
  })

  const legPath = (k) => {
    const a = flat[k]
    const b = flat[k + 1]
    const segmentPath =
      a.day === b.day
        ? segmentForLeg(a.day, a.i, a.wp, b.wp)?.path
        : null
    return normalizeLegPath(segmentPath, a.wp, b.wp)
  }

  const stops = []
  let prevFlat = -1
  flat.forEach((entry, k) => {
    if (!isContentNode(entry.wp) || !hasNarration(entry.wp)) return

    let routeToHere = []
    if (prevFlat >= 0) {
      for (let j = prevFlat; j < k; j += 1) {
        appendPath(routeToHere, legPath(j))
      }
    }
    if (routeToHere.length < 2) routeToHere = []

    const duplicateWithoutTravel =
      stops.length &&
      sameNarratedPlace(stops.at(-1).node, entry.wp) &&
      routeDistance(routeToHere) <= DUPLICATE_TRAVEL_TOLERANCE_METERS
    if (duplicateWithoutTravel) return

    const wp = entry.wp
    stops.push({
      node: {
        placeId: wp.placeId,
        lng: wp.lng,
        lat: wp.lat,
        name: wp.name,
        altitude: wp.altitude,
        address: wp.address ?? '',
        note: wp.note ?? '',
        images: Array.isArray(wp.images) ? [...wp.images] : [],
        narration: wp.narration,
        roles: Array.isArray(wp.roles) ? [...wp.roles] : [],
        source: cloneData(wp.source ?? null),
        choreography: cloneData(wp.choreography ?? null),
      },
      routeToHere,
    })
    prevFlat = k
  })
  return stops
}

// 全程总里程（米）：有 segments 用其 distance，否则相邻节点直线累加
export function computeTotalDistance(plan) {
  if (!Array.isArray(plan?.days)) return 0
  let total = 0
  for (const day of plan.days) {
    if (day.segments?.length) {
      for (const s of day.segments) total += s.distance || 0
    } else {
      const wps = Array.isArray(day?.waypoints) ? day.waypoints : []
      for (let i = 0; i < wps.length - 1; i += 1) {
        total += haversine([wps[i].lng, wps[i].lat], [wps[i + 1].lng, wps[i + 1].lat])
      }
    }
  }
  return total
}

import { haversine } from './geo'

// 把 plan 里所有「有旁白」的节点按全局顺序收集成 stops。
// routeToHere = 上一个有旁白节点 → 当前节点之间、串联沿途各 leg 的折线。
// 每个 leg 优先用同一天的 day.segments[i].path（segments[i] 连接 waypoints[i]→[i+1]），否则两点直线。
export function collectNarratedStops(plan) {
  if (!plan?.days) return []

  const flat = []
  plan.days.forEach((day) => {
    ;(day.waypoints || []).forEach((wp, i) => flat.push({ wp, day, i }))
  })

  const legPath = (k) => {
    const a = flat[k]
    const b = flat[k + 1]
    if (a.day === b.day) {
      const seg = a.day.segments?.[a.i]
      if (seg?.path?.length) return seg.path
    }
    return [[a.wp.lng, a.wp.lat], [b.wp.lng, b.wp.lat]]
  }

  const stops = []
  let prevFlat = -1
  flat.forEach((entry, k) => {
    if (!entry.wp.narration) return
    let routeToHere = []
    if (prevFlat >= 0) {
      for (let j = prevFlat; j < k; j++) {
        const lp = legPath(j)
        routeToHere =
          routeToHere.length && lp.length ? routeToHere.concat(lp.slice(1)) : routeToHere.concat(lp)
      }
    }
    const wp = entry.wp
    stops.push({
      node: {
        lng: wp.lng,
        lat: wp.lat,
        name: wp.name,
        altitude: wp.altitude,
        address: wp.address ?? '',
        note: wp.note ?? '',
        images: Array.isArray(wp.images) ? wp.images : [],
        narration: wp.narration,
        choreography: wp.choreography ?? null, // 4e：{ config, narrationHash }，展示页据此编译动效

      },
      routeToHere,
    })
    prevFlat = k
  })
  return stops
}

// 全程总里程（米）：有 segments 用其 distance，否则相邻节点直线累加
export function computeTotalDistance(plan) {
  if (!plan?.days) return 0
  let total = 0
  for (const day of plan.days) {
    if (day.segments?.length) {
      for (const s of day.segments) total += s.distance || 0
    } else {
      const wps = day.waypoints || []
      for (let i = 0; i < wps.length - 1; i++) {
        total += haversine([wps[i].lng, wps[i].lat], [wps[i + 1].lng, wps[i + 1].lat])
      }
    }
  }
  return total
}

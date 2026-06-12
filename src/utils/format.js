export function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)}m`
  const km = meters / 1000
  if (km >= 100) return `${Math.round(km)}km`
  return `${km.toFixed(1).replace(/\.0$/, '')}km`
}

export function formatDuration(seconds) {
  let h = Math.floor(seconds / 3600)
  let m = Math.round((seconds % 3600) / 60)
  if (m === 60) {
    h += 1
    m = 0
  }
  if (h === 0) return `${m}分钟`
  if (m === 0) return `${h}小时`
  return `${h}小时${m}分`
}

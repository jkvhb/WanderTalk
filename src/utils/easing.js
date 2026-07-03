export function clamp01(t) {
  return t < 0 ? 0 : t > 1 ? 1 : t
}

// 标准 ease-in-out 三次缓动：两端慢、中间快，相机加减速自然
export function easeInOutCubic(t) {
  const x = clamp01(t)
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

// 两端归零窗：p∈[0,edge] 缓升 0→1，中段恒 1，p∈[1-edge,1] 缓降 1→0。
// 用于 fly 段两端与 dwell 相机（zoom/bearing/padding）的无缝衔接。
export function edgeWindow(p, edge = 0.15) {
  const x = clamp01(p)
  if (x < edge) return easeInOutCubic(x / edge)
  if (x > 1 - edge) return easeInOutCubic((1 - x) / edge)
  return 1
}

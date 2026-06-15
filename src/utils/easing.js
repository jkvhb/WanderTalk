export function clamp01(t) {
  return t < 0 ? 0 : t > 1 ? 1 : t
}

// 标准 ease-in-out 三次缓动：两端慢、中间快，相机加减速自然
export function easeInOutCubic(t) {
  const x = clamp01(t)
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

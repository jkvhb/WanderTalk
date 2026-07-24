export function capCameraZoom(zoom, { min = 4, max = 11.5 } = {}) {
  if (!Number.isFinite(zoom)) return min
  return Math.min(max, Math.max(min, zoom))
}

export function cameraTransitionFor(target, { animate, hasPrevious, duration }) {
  if (animate && hasPrevious && duration > 0) {
    return {
      method: 'flyTo',
      options: {
        ...target,
        duration,
        essential: true,
        freezeElevation: true,
      },
    }
  }
  return { method: 'jumpTo', options: target }
}
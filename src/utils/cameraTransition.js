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
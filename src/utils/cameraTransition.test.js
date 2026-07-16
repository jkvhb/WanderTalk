import { describe, expect, it } from 'vitest'
import { cameraTransitionFor } from './cameraTransition'

describe('cameraTransitionFor', () => {
  const target = {
    center: [101.5, 30.2],
    zoom: 8.5,
    pitch: 25,
    bearing: 0,
    padding: { top: 0, bottom: 0, left: 0, right: 0 },
  }

  it('把可见的 3D 地形转场构造成海拔安全 flyTo', () => {
    expect(cameraTransitionFor(target, { animate: true, hasPrevious: true, duration: 3000 })).toEqual({
      method: 'flyTo',
      options: {
        ...target,
        duration: 3000,
        essential: true,
        freezeElevation: true,
      },
    })
  })

  it('首次定位或无动画时仍直接 jumpTo', () => {
    expect(cameraTransitionFor(target, { animate: false, hasPrevious: true, duration: 3000 })).toEqual({
      method: 'jumpTo',
      options: target,
    })
    expect(cameraTransitionFor(target, { animate: true, hasPrevious: false, duration: 3000 })).toEqual({
      method: 'jumpTo',
      options: target,
    })
  })
})

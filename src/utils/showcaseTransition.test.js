import { describe, expect, it } from 'vitest'
import { compileShowcaseTransition } from './showcaseTransition'

const origin = { x: 120, y: 80, maxR: 400 }

describe('compileShowcaseTransition', () => {
  it('路线绽放按播放进度编译精确的圆形裁切', () => {
    expect(compileShowcaseTransition({
      transition: { enter: 'route-bloom' },
      revealFrac: 0.5,
      origin,
    })).toEqual({
      kind: 'route-bloom',
      style: { clipPath: 'circle(200px at 120px 80px)' },
    })
  })

  it('向左擦除只输出安全的 inset 裁切，不保留圆形裁切', () => {
    const result = compileShowcaseTransition({
      transition: { enter: 'directional-wipe', direction: 'left' },
      revealFrac: 0.25,
      origin,
    })

    expect(result).toEqual({
      kind: 'directional-wipe',
      style: { clipPath: 'inset(0 0 0 75%)' },
    })
    expect(result.style).not.toHaveProperty('clipPath', expect.stringContaining('circle'))
  })

  it('柔和溶解直接把进度作为透明度', () => {
    expect(compileShowcaseTransition({
      transition: { enter: 'soft-dissolve' },
      revealFrac: 0.4,
      origin,
    })).toEqual({ kind: 'soft-dissolve', style: { opacity: 0.4 } })
  })

  it('照片级联按能量收敛位移，并且不接受任意 CSS 字符串', () => {
    expect(compileShowcaseTransition({
      transition: { enter: 'photo-cascade', energy: 'accent', transform: 'rotate(1turn)' },
      revealFrac: 0.5,
      origin,
    })).toEqual({
      kind: 'photo-cascade',
      style: { opacity: 0.5, transform: 'translate3d(0, 10%, 0)' },
    })
  })

  it('图层展开按锚点选择受限的 transformOrigin', () => {
    expect(compileShowcaseTransition({
      transition: { enter: 'layer-unfold', energy: 'medium', anchor: 'image-focus' },
      revealFrac: 0,
      origin,
    })).toEqual({
      kind: 'layer-unfold',
      style: { opacity: 0, transform: 'scale(0.94)', transformOrigin: '50% 42%' },
    })
  })

  it('章节上滑在 accent 的起点使用 18% 位移', () => {
    expect(compileShowcaseTransition({
      transition: { enter: 'chapter-slide', direction: 'up', energy: 'accent' },
      revealFrac: 0,
      origin,
    })).toEqual({
      kind: 'chapter-slide',
      style: { opacity: 0, transform: 'translate3d(0, 18%, 0)' },
    })
  })

  it('减少动态时强制退化为柔和溶解', () => {
    expect(compileShowcaseTransition({
      transition: { enter: 'chapter-slide', direction: 'right', energy: 'accent' },
      revealFrac: 0.6,
      origin,
      reducedMotion: true,
    })).toEqual({ kind: 'soft-dissolve', style: { opacity: 0.6 } })
  })

  it('钳制越界进度，并在畸形配置或原点无效时安全回退', () => {
    expect(compileShowcaseTransition({
      transition: { enter: 'chapter-slide', direction: 'up', energy: 'accent' },
      revealFrac: 3,
      origin,
    })).toEqual({
      kind: 'chapter-slide',
      style: { opacity: 1, transform: 'translate3d(0, 0%, 0)' },
    })

    expect(compileShowcaseTransition({
      transition: { enter: 'url(javascript:alert(1))', direction: 'translateX(1px)' },
      revealFrac: -2,
      origin: { x: 'bad', y: null, maxR: NaN },
    })).toEqual({
      kind: 'route-bloom',
      style: { clipPath: 'circle(0px at 0px 0px)' },
    })
  })
})

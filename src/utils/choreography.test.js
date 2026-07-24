import { describe, it, expect } from 'vitest'
import { normalizeChoreography, defaultChoreography, compileChoreography } from './choreography'
import { hashString } from './rand'

describe('defaultChoreography', () => {
  it('adds a complete transition default based on image count', () => {
    expect(defaultChoreography(0).transition).toEqual({
      enter: 'directional-wipe', anchor: 'route-end', direction: 'forward', energy: 'medium', layout: 'text-first', exit: 'follow-route',
    })
    expect(defaultChoreography(1).transition).toEqual({
      enter: 'photo-cascade', anchor: 'image-focus', direction: 'forward', energy: 'medium', layout: 'hero-image', exit: 'follow-route',
    })
    expect(defaultChoreography(2).transition).toEqual({
      enter: 'photo-cascade', anchor: 'route-end', direction: 'forward', energy: 'medium', layout: 'scattered-cards', exit: 'follow-route',
    })
  })
  it('相位均分：3 张图 → at 0/⅓/⅔，focus 依次 0/1/2，accent 全 none', () => {
    const d = defaultChoreography(3)
    expect(d.tempo).toBe('medium')
    expect(d.phases).toHaveLength(3)
    expect(d.phases.map((p) => p.focus)).toEqual([0, 1, 2])
    expect(d.phases[0].at).toBe(0)
    expect(d.phases[1].at).toBeCloseTo(1 / 3, 6)
    expect(d.phases[2].at).toBeCloseTo(2 / 3, 6)
    expect(d.phases.every((p) => p.accent === 'none')).toBe(true)
  })

  it('idle 默认 drift 0.4 / breathe 0.3', () => {
    expect(defaultChoreography(2).idle).toEqual({ drift: 0.4, breathe: 0.3 })
  })

  it('0 张图也返回合法结构（首相位 at=0）', () => {
    const d = defaultChoreography(0)
    expect(d.phases.length).toBeGreaterThanOrEqual(1)
    expect(d.phases[0].at).toBe(0)
  })
})

describe('normalizeChoreography', () => {
  it('uses route-bloom for saved configurations that lack transition', () => {
    expect(normalizeChoreography({ tempo: 'calm' }, 2).transition).toEqual({
      enter: 'route-bloom', anchor: 'route-end', direction: 'forward', energy: 'medium', layout: 'scattered-cards', exit: 'return-map',
    })
  })

  it('replaces hostile transition strings with safe values', () => {
    expect(normalizeChoreography({
      transition: { enter: 'url(javascript:alert(1))', anchor: '<script>', direction: 'translateX(100vw)', energy: 'var(--unsafe)', layout: 'position:fixed', exit: 'expression(alert(1))' },
    }, 2).transition).toEqual({
      enter: 'route-bloom', anchor: 'route-end', direction: 'forward', energy: 'medium', layout: 'scattered-cards', exit: 'return-map',
    })
  })

  it('normalizes partial transition objects field-by-field', () => {
    expect(normalizeChoreography({ transition: { enter: 'soft-dissolve', direction: 'left' } }, 1).transition).toEqual({
      enter: 'soft-dissolve', anchor: 'route-end', direction: 'left', energy: 'medium', layout: 'hero-image', exit: 'return-map',
    })
  })

  it('reduces transitions to available zero- and single-image capabilities', () => {
    expect(normalizeChoreography({
      transition: { enter: 'photo-cascade', anchor: 'image-focus', direction: 'down', energy: 'accent', layout: 'hero-image', exit: 'soft-dissolve' },
    }, 0).transition).toEqual({
      enter: 'directional-wipe', anchor: 'route-end', direction: 'down', energy: 'accent', layout: 'text-first', exit: 'soft-dissolve',
    })
    expect(normalizeChoreography({
      transition: { enter: 'layer-unfold', anchor: 'image-focus', direction: 'right', energy: 'calm', layout: 'sequential-cards', exit: 'follow-route' },
    }, 1).transition).toEqual({
      enter: 'photo-cascade', anchor: 'image-focus', direction: 'right', energy: 'calm', layout: 'hero-image', exit: 'follow-route',
    })
  })
  it('null/非对象/垃圾输入 → 默认配置', () => {
    expect(normalizeChoreography(null, 3)).toEqual(defaultChoreography(3))
    expect(normalizeChoreography('garbage', 3)).toEqual(defaultChoreography(3))
    expect(normalizeChoreography(42, 3)).toEqual(defaultChoreography(3))
  })

  it('tempo 非法取 medium，合法保留', () => {
    expect(normalizeChoreography({ tempo: 'turbo' }, 2).tempo).toBe('medium')
    expect(normalizeChoreography({ tempo: 'calm' }, 2).tempo).toBe('calm')
    expect(normalizeChoreography({ tempo: 'lively' }, 2).tempo).toBe('lively')
  })

  it('focus 越界取模（含负数）', () => {
    const n = normalizeChoreography(
      { phases: [{ at: 0, focus: 5 }, { at: 0.5, focus: -1 }] },
      3,
    )
    expect(n.phases[0].focus).toBe(2) // 5 % 3
    expect(n.phases[1].focus).toBe(2) // -1 → 2
  })

  it('at 排序、去重、首个强制置 0、clamp 到 [0,1]', () => {
    const n = normalizeChoreography(
      { phases: [{ at: 0.5, focus: 1 }, { at: 0.2, focus: 0 }, { at: 0.5, focus: 2 }, { at: 3, focus: 0 }] },
      3,
    )
    const ats = n.phases.map((p) => p.at)
    expect(ats[0]).toBe(0) // 最早的 0.2 被强制置 0
    expect(ats).toEqual([...ats].sort((a, b) => a - b))
    expect(new Set(ats).size).toBe(ats.length) // 去重
    expect(ats.every((a) => a >= 0 && a <= 1)).toBe(true)
  })

  it('phases 缺失/为空 → 均分', () => {
    expect(normalizeChoreography({ tempo: 'calm' }, 2).phases).toEqual(defaultChoreography(2).phases)
    expect(normalizeChoreography({ tempo: 'calm', phases: [] }, 2).phases).toEqual(
      defaultChoreography(2).phases,
    )
  })

  it('accent 只认 pulse，其余归 none', () => {
    const n = normalizeChoreography(
      { phases: [{ at: 0, focus: 0, accent: 'pulse' }, { at: 0.5, focus: 1, accent: 'boom' }] },
      2,
    )
    expect(n.phases[0].accent).toBe('pulse')
    expect(n.phases[1].accent).toBe('none')
  })

  it('idle 数值 clamp 到 [0,1]，缺失补默认', () => {
    expect(normalizeChoreography({ idle: { drift: 5, breathe: -1 } }, 2).idle).toEqual({
      drift: 1,
      breathe: 0,
    })
    expect(normalizeChoreography({ idle: {} }, 2).idle).toEqual({ drift: 0.4, breathe: 0.3 })
    expect(normalizeChoreography({ idle: { drift: null, breathe: null } }, 2).idle).toEqual({
      drift: 0.4,
      breathe: 0.3,
    })
    expect(normalizeChoreography({ idle: { drift: 0, breathe: 0 } }, 2).idle).toEqual({
      drift: 0,
      breathe: 0,
    })
    expect(normalizeChoreography({ idle: { drift: 'x', breathe: NaN } }, 2).idle).toEqual({
      drift: 0.4,
      breathe: 0.3,
    })
  })
})

describe('compileChoreography', () => {
  const cfg = defaultChoreography(3)
  const seed = hashString('稻城亚丁的旁白文本')

  it('0 张图 / imageCount 缺失 → mode none', () => {
    expect(compileChoreography(cfg, { imageCount: 0, seed })).toEqual({
      mode: 'none',
      transition: {
        enter: 'directional-wipe', anchor: 'route-end', direction: 'forward', energy: 'medium', layout: 'text-first', exit: 'follow-route',
      },
    })
    expect(compileChoreography(cfg, { seed }).mode).toBe('none')
  })

  it('1 张图 → fullbleed 微呼吸，幅度 ≤ 2%（尊重"撤 Ken Burns"反馈）', () => {
    const out = compileChoreography(defaultChoreography(1), { imageCount: 1, seed })
    expect(out.mode).toBe('fullbleed')
    expect(out.breathe.amp).toBeGreaterThan(0)
    expect(out.breathe.amp).toBeLessThanOrEqual(0.02)
    expect(out.breathe.periodS).toBeGreaterThan(0)
  })

  it('≥2 张图 → cards：数量对齐、含相位表', () => {
    const out = compileChoreography(cfg, { imageCount: 3, seed })
    expect(out.mode).toBe('cards')
    expect(out.cards).toHaveLength(3)
    expect(out.phases).toEqual(cfg.phases)
    for (const c of out.cards) {
      expect(c.base).toMatchObject({ xPct: expect.any(Number), yPct: expect.any(Number), rotDeg: expect.any(Number), z: expect.any(Number) })
      expect(c.drift).toMatchObject({ dxPct: expect.any(Number), dyPct: expect.any(Number), dRotDeg: expect.any(Number), periodS: expect.any(Number), delayS: expect.any(Number) })
      expect(c.breathe).toMatchObject({ amp: expect.any(Number), periodS: expect.any(Number) })
      expect(c.enter).toMatchObject({ delayS: expect.any(Number), durS: expect.any(Number) })
    }
  })

  it('确定性：同配置同 seed 重复编译 deep-equal', () => {
    const a = compileChoreography(cfg, { imageCount: 3, seed })
    const b = compileChoreography(cfg, { imageCount: 3, seed })
    expect(a).toEqual(b)
  })

  it('不同 seed 产生不同基位', () => {
    const a = compileChoreography(cfg, { imageCount: 3, seed: 1 })
    const b = compileChoreography(cfg, { imageCount: 3, seed: 2 })
    expect(a.cards.map((c) => c.base)).not.toEqual(b.cards.map((c) => c.base))
  })

  it('安全区：多 seed 下基位始终落在 x 35~85% / y 8~55%（避开左下文字块与底部控件）', () => {
    for (let s = 0; s < 60; s++) {
      for (const count of [2, 3]) {
        const out = compileChoreography(defaultChoreography(count), { imageCount: count, seed: hashString('seed' + s) })
        for (const c of out.cards) {
          expect(c.base.xPct).toBeGreaterThanOrEqual(35)
          expect(c.base.xPct).toBeLessThanOrEqual(85)
          expect(c.base.yPct).toBeGreaterThanOrEqual(8)
          expect(c.base.yPct).toBeLessThanOrEqual(55)
        }
      }
    }
  })

  it('入场按序错峰：delay 严格递增，间隔=tempo 决定', () => {
    const out = compileChoreography(cfg, { imageCount: 3, seed })
    const delays = out.cards.map((c) => c.enter.delayS)
    expect(delays[0]).toBeLessThan(delays[1])
    expect(delays[1]).toBeLessThan(delays[2])
  })

  it('tempo 映射：lively 入场更密、漂移周期更短', () => {
    const calm = compileChoreography({ ...cfg, tempo: 'calm' }, { imageCount: 3, seed })
    const lively = compileChoreography({ ...cfg, tempo: 'lively' }, { imageCount: 3, seed })
    const gap = (o) => o.cards[1].enter.delayS - o.cards[0].enter.delayS
    expect(gap(lively)).toBeLessThan(gap(calm))
    expect(lively.cards[0].drift.periodS).toBeLessThan(calm.cards[0].drift.periodS)
  })

  it('idle.drift 控制漂移振幅：0 时幅度显著小于 1 时', () => {
    const still = compileChoreography({ ...cfg, idle: { drift: 0, breathe: 0.3 } }, { imageCount: 2, seed })
    const wild = compileChoreography({ ...cfg, idle: { drift: 1, breathe: 0.3 } }, { imageCount: 2, seed })
    expect(Math.abs(still.cards[0].drift.dxPct)).toBeLessThan(Math.abs(wild.cards[0].drift.dxPct))
  })

  it('原始（未 normalize 的）配置也能编译——内部先清洗', () => {
    const out = compileChoreography({ tempo: 'bad', phases: [{ at: 2, focus: 99 }] }, { imageCount: 2, seed })
    expect(out.mode).toBe('cards')
    expect(out.phases[0].at).toBe(0)
    expect(out.phases[0].focus).toBe(1) // 99 % 2
  })
})

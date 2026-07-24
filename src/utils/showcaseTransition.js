const KIND_BY_ENTER = {
  'route-bloom': 'route-bloom',
  'directional-wipe': 'directional-wipe',
  'photo-cascade': 'photo-cascade',
  'soft-dissolve': 'soft-dissolve',
  'layer-unfold': 'layer-unfold',
  'chapter-slide': 'chapter-slide',
}

const DIRECTION_BY_VALUE = {
  left: 'left',
  right: 'right',
  up: 'up',
  down: 'down',
}

const ENERGY_BY_VALUE = { calm: 'calm', medium: 'medium', accent: 'accent' }
const EXIT_BY_VALUE = { 'return-map': 'return-map', 'follow-route': 'follow-route', 'soft-dissolve': 'soft-dissolve' }
const CASCADE_OFFSET_BY_ENERGY = { calm: 12, medium: 16, accent: 20 }
const UNFOLD_START_BY_ENERGY = { calm: 0.96, medium: 0.94, accent: 0.92 }
const SLIDE_DISTANCE_BY_ENERGY = { calm: 10, medium: 14, accent: 18 }

function own(source, key) {
  return Object.hasOwn(source, key) ? source[key] : undefined
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function safeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback
}

function formatNumber(value) {
  const rounded = Math.round(value * 1e6) / 1e6
  return Object.is(rounded, -0) ? '0' : String(rounded)
}

function normalizedDirection(value, forwardDirection) {
  if (value === 'forward') return DIRECTION_BY_VALUE[forwardDirection] || 'left'
  return DIRECTION_BY_VALUE[value] || 'left'
}

function normalizedTransition(transition, forwardDirection) {
  const source = transition && typeof transition === 'object' && !Array.isArray(transition)
    ? transition
    : {}

  return {
    kind: KIND_BY_ENTER[own(source, 'enter')] || 'route-bloom',
    direction: normalizedDirection(own(source, 'direction'), forwardDirection),
    energy: ENERGY_BY_VALUE[own(source, 'energy')] || 'medium',
    exit: EXIT_BY_VALUE[own(source, 'exit')] || 'return-map',
    anchor: own(source, 'anchor') === 'image-focus' || own(source, 'anchor') === 'screen-center'
      ? own(source, 'anchor')
      : 'route-end',
  }
}

function normalizedOrigin(origin) {
  const source = origin && typeof origin === 'object' && !Array.isArray(origin) ? origin : {}
  return {
    x: safeNumber(own(source, 'x')),
    y: safeNumber(own(source, 'y')),
    maxR: Math.max(0, safeNumber(own(source, 'maxR'))),
  }
}

function wipeClipPath(direction, closed) {
  const amount = `${formatNumber(closed)}%`
  const INSETS = {
    left: `inset(0 0 0 ${amount})`,
    right: `inset(0 ${amount} 0 0)`,
    up: `inset(${amount} 0 0 0)`,
    down: `inset(0 0 ${amount} 0)`,
  }
  return INSETS[direction]
}

function slideTransform(direction, distance) {
  const amount = `${formatNumber(distance)}%`
  const TRANSFORMS = {
    left: `translate3d(${amount}, 0, 0)`,
    right: `translate3d(-${amount}, 0, 0)`,
    up: `translate3d(0, ${amount}, 0)`,
    down: `translate3d(0, -${amount}, 0)`,
  }
  return TRANSFORMS[direction]
}

function exitStyle(config, reveal, closing) {
  if (!closing || config.exit === 'return-map') return null
  if (config.exit === 'soft-dissolve') return { kind: 'soft-dissolve', style: { opacity: reveal } }
  const distance = (1 - reveal) * SLIDE_DISTANCE_BY_ENERGY[config.energy]
  return { kind: null, style: { opacity: reveal, transform: slideTransform(config.direction, distance) } }
}

export function compileShowcaseTransition(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const reveal = clamp(safeNumber(own(source, 'revealFrac')), 0, 1)
  const config = normalizedTransition(own(source, 'transition'), own(source, 'forwardDirection'))
  const point = normalizedOrigin(own(source, 'origin'))
  const reducedMotion = own(source, 'reducedMotion') === true
  const closing = own(source, 'closing') === true
  const kind = reducedMotion ? 'soft-dissolve' : config.kind

  if (kind === 'route-bloom') {
    const exit = reducedMotion ? null : exitStyle(config, reveal, closing)
    if (exit?.kind) return exit
    return {
      kind,
      style: {
        clipPath: `circle(${formatNumber(reveal * point.maxR)}px at ${formatNumber(point.x)}px ${formatNumber(point.y)}px)`,
        ...(exit?.style || {}),
      },
    }
  }

  if (kind === 'directional-wipe') {
    const exit = exitStyle(config, reveal, closing)
    if (exit?.kind) return exit
    return {
      kind,
      style: { clipPath: wipeClipPath(config.direction, (1 - reveal) * 100), ...(exit?.style || {}) },
    }
  }

  if (kind === 'soft-dissolve') return { kind, style: { opacity: reveal } }

  const exit = exitStyle(config, reveal, closing)
  if (exit?.kind) return exit
  if (exit?.style) return { kind, style: exit.style }

  if (kind === 'photo-cascade') {
    const offset = (1 - reveal) * CASCADE_OFFSET_BY_ENERGY[config.energy]
    return { kind, style: { opacity: reveal, transform: `translate3d(0, ${formatNumber(offset)}%, 0)` } }
  }

  if (kind === 'layer-unfold') {
    const start = UNFOLD_START_BY_ENERGY[config.energy]
    const transformOrigin = config.anchor === 'image-focus'
      ? '50% 42%'
      : config.anchor === 'screen-center'
        ? '50% 50%'
        : `${formatNumber(point.x)}px ${formatNumber(point.y)}px`
    return {
      kind,
      style: {
        opacity: reveal,
        transform: `scale(${formatNumber(start + (1 - start) * reveal)})`,
        transformOrigin,
      },
    }
  }

  const distance = (1 - reveal) * SLIDE_DISTANCE_BY_ENERGY[config.energy]
  return { kind: 'chapter-slide', style: { opacity: reveal, transform: slideTransform(config.direction, distance) } }
}
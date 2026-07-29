export const PRESET_IDS = [
  'right-rail',
  'left-rail',
  'top-filmstrip',
  'bottom-filmstrip',
  'feature-rail',
]

const PRESETS = {
  'right-rail': {
    panel: { xPct: 69, yPct: 0, widthPct: 31, heightPct: 100 },
    identity: { xPct: 4, yPct: 6, align: 'left' },
    mapTarget: { xPct: 42, yPct: 50 },
    slots: [
      { xPct: 74, yPct: 5, widthPct: 22, heightPct: 24 },
      { xPct: 74, yPct: 38, widthPct: 22, heightPct: 24 },
      { xPct: 74, yPct: 71, widthPct: 22, heightPct: 24 },
    ],
  },
  'left-rail': {
    panel: { xPct: 0, yPct: 0, widthPct: 31, heightPct: 100 },
    identity: { xPct: 96, yPct: 6, align: 'right' },
    mapTarget: { xPct: 58, yPct: 50 },
    slots: [
      { xPct: 4, yPct: 5, widthPct: 22, heightPct: 24 },
      { xPct: 4, yPct: 38, widthPct: 22, heightPct: 24 },
      { xPct: 4, yPct: 71, widthPct: 22, heightPct: 24 },
    ],
  },
  'top-filmstrip': {
    panel: { xPct: 0, yPct: 0, widthPct: 100, heightPct: 32 },
    identity: { xPct: 4, yPct: 88, align: 'left', anchorY: 'bottom' },
    mapTarget: { xPct: 50, yPct: 58 },
    slots: [
      { xPct: 5, yPct: 4, widthPct: 20, heightPct: 23 },
      { xPct: 28, yPct: 4, widthPct: 20, heightPct: 23 },
      { xPct: 51, yPct: 4, widthPct: 20, heightPct: 23 },
      { xPct: 74, yPct: 4, widthPct: 20, heightPct: 23 },
    ],
  },
  'bottom-filmstrip': {
    panel: { xPct: 0, yPct: 68, widthPct: 100, heightPct: 32 },
    identity: { xPct: 4, yPct: 6, align: 'left' },
    mapTarget: { xPct: 50, yPct: 42 },
    slots: [
      { xPct: 5, yPct: 73, widthPct: 20, heightPct: 23 },
      { xPct: 28, yPct: 73, widthPct: 20, heightPct: 23 },
      { xPct: 51, yPct: 73, widthPct: 20, heightPct: 23 },
      { xPct: 74, yPct: 73, widthPct: 20, heightPct: 23 },
    ],
  },
  'feature-rail': {
    panel: { xPct: 65, yPct: 0, widthPct: 35, heightPct: 100 },
    identity: { xPct: 4, yPct: 6, align: 'left' },
    mapTarget: { xPct: 40, yPct: 50 },
    slots: [{ xPct: 69, yPct: 10, widthPct: 27, heightPct: 52 }],
  },
}

function rectInPixels(panel, viewport) {
  return {
    left: viewport.width * panel.xPct / 100,
    top: viewport.height * panel.yPct / 100,
    right: viewport.width * (panel.xPct + panel.widthPct) / 100,
    bottom: viewport.height * (panel.yPct + panel.heightPct) / 100,
  }
}

function pointNearRect(point, rect, margin) {
  const x = Math.max(rect.left, Math.min(point.x, rect.right))
  const y = Math.max(rect.top, Math.min(point.y, rect.bottom))
  return Math.hypot(point.x - x, point.y - y) <= margin
}

function segmentIntersectsRect(a, b, rect) {
  let t0 = 0
  let t1 = 1
  const dx = b.x - a.x
  const dy = b.y - a.y
  const checks = [
    [-dx, a.x - rect.left],
    [dx, rect.right - a.x],
    [-dy, a.y - rect.top],
    [dy, rect.bottom - a.y],
  ]
  for (const [p, q] of checks) {
    if (p === 0 && q < 0) return false
    if (p === 0) continue
    const r = q / p
    if (p < 0) {
      if (r > t1) return false
      if (r > t0) t0 = r
    } else {
      if (r < t0) return false
      if (r < t1) t1 = r
    }
  }
  return true
}

function routeNearRect(routePoints, rect, margin) {
  if (!Array.isArray(routePoints) || routePoints.length === 0) return false
  const expanded = {
    left: rect.left - margin,
    top: rect.top - margin,
    right: rect.right + margin,
    bottom: rect.bottom + margin,
  }
  if (routePoints.some((point) => pointNearRect(point, expanded, 0))) return true
  for (let index = 1; index < routePoints.length; index++) {
    if (segmentIntersectsRect(routePoints[index - 1], routePoints[index], expanded)) return true
  }
  return false
}

function preferredPresets(storyMode, imageCount) {
  if (imageCount <= 1 || storyMode === 'hero') {
    return ['feature-rail', 'right-rail', 'left-rail', 'bottom-filmstrip', 'top-filmstrip']
  }
  if (storyMode === 'parallel') {
    return ['bottom-filmstrip', 'top-filmstrip', 'right-rail', 'left-rail']
  }
  return ['right-rail', 'left-rail', 'bottom-filmstrip', 'top-filmstrip']
}

function fittedSlots(presetId, count) {
  const limited = Math.max(0, Math.min(4, count))
  if (presetId === 'feature-rail') return PRESETS[presetId].slots.slice(0, 1).map((slot) => ({ ...slot }))
  if (presetId === 'right-rail' || presetId === 'left-rail') {
    const xPct = presetId === 'right-rail' ? 74 : 4
    const heightPct = limited >= 4 ? 20 : limited === 3 ? 24 : 28
    const gapPct = limited >= 4 ? 4 : limited === 3 ? 9 : 8
    const total = limited * heightPct + Math.max(0, limited - 1) * gapPct
    const start = (100 - total) / 2
    return Array.from({ length: limited }, (_, index) => ({
      xPct,
      yPct: start + index * (heightPct + gapPct),
      widthPct: 22,
      heightPct,
    }))
  }
  const widthPct = limited >= 4 ? 20 : limited === 3 ? 25 : 32
  const gapPct = limited >= 4 ? 3 : 4
  const total = limited * widthPct + Math.max(0, limited - 1) * gapPct
  const start = (100 - total) / 2
  const yPct = presetId === 'top-filmstrip' ? 4 : 73
  return Array.from({ length: limited }, (_, index) => ({
    xPct: start + index * (widthPct + gapPct),
    yPct,
    widthPct,
    heightPct: 23,
  }))
}

function mapOnly(story) {
  return {
    presetId: 'map-only',
    panel: null,
    slots: [],
    identity: { xPct: 4, yPct: 6, align: 'left' },
    mapTarget: { xPct: 50, yPct: 50 },
    imageOrder: [],
    beats: story?.beats || [],
  }
}

export function resolveMapShowcaseLayout(input = {}) {
  const viewport = input.viewport || {}
  if (!(viewport.width > 0) || !(viewport.height > 0)) return mapOnly(input.story)

  const imageCount = Math.max(0, input.imageCount | 0)
  if (imageCount === 0) return mapOnly(input.story)

  const story = input.story || {}
  const recent = Array.isArray(input.recentPresetIds) ? input.recentPresetIds : []
  const counts = input.dayPresetCounts || {}
  const candidates = preferredPresets(story.storyMode, imageCount)
    .filter((presetId) => presetId !== 'feature-rail' || imageCount <= 2)
    .map((presetId, preferenceIndex) => ({ presetId, preferenceIndex, preset: PRESETS[presetId] }))
    .filter(({ preset }) => {
      const panel = rectInPixels(preset.panel, viewport)
      const areaFrac = preset.panel.widthPct * preset.panel.heightPct / 10000
      if (areaFrac > 0.35) return false
      if (input.nodePoint && pointNearRect(input.nodePoint, panel, 72)) return false
      return !routeNearRect(input.routePoints, panel, 24)
    })
    .sort((a, b) => {
      const recentA = recent.includes(a.presetId) ? 1 : 0
      const recentB = recent.includes(b.presetId) ? 1 : 0
      if (recentA !== recentB) return recentA - recentB
      const countA = Number(counts[a.presetId]) || 0
      const countB = Number(counts[b.presetId]) || 0
      if (countA !== countB) return countA - countB
      return a.preferenceIndex - b.preferenceIndex
    })

  if (!candidates.length) return mapOnly(story)
  const { presetId, preset } = candidates[0]
  const slots = fittedSlots(presetId, imageCount)
  const orderLimit = presetId === 'feature-rail' ? Math.min(2, imageCount) : slots.length
  const imageOrder = (Array.isArray(story.imageOrder) ? story.imageOrder : [])
    .filter((index) => Number.isInteger(index) && index >= 0 && index < imageCount)
    .slice(0, orderLimit)
  return {
    presetId,
    panel: { ...preset.panel },
    slots: slots.slice(0, imageOrder.length),
    identity: { ...preset.identity },
    mapTarget: { ...preset.mapTarget },
    imageOrder,
    beats: Array.isArray(story.beats) ? story.beats.map((beat) => ({ ...beat })) : [],
  }
}

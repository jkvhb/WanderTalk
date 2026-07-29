const STORY_MODES = ['sequential', 'parallel', 'hero']
const EMPHASIS = ['name', 'altitude', 'route', 'scenery']

const clamp01 = (value) => Math.min(1, Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0))

function validImageIndex(value, imageCount) {
  const index = Math.trunc(Number(value))
  return Number.isFinite(index) && index >= 0 && index < imageCount ? index : null
}

function normalizeImageOrder(rawOrder, imageCount) {
  const order = []
  for (const value of Array.isArray(rawOrder) ? rawOrder : []) {
    const index = validImageIndex(value, imageCount)
    if (index != null && !order.includes(index)) order.push(index)
  }
  for (let index = 0; index < imageCount; index++) {
    if (!order.includes(index)) order.push(index)
  }
  return order
}

function normalizeBeats(rawBeats, imageOrder) {
  if (!imageOrder.length) return []
  const allowed = new Set(imageOrder)
  const beats = (Array.isArray(rawBeats) ? rawBeats : [])
    .map((beat) => ({
      at: clamp01(beat?.at),
      focus: validImageIndex(beat?.focus, Math.max(...imageOrder) + 1),
    }))
    .filter((beat) => beat.focus != null && allowed.has(beat.focus))
    .sort((a, b) => a.at - b.at)

  const unique = []
  for (const beat of beats) {
    if (!unique.some((entry) => entry.at === beat.at)) unique.push(beat)
  }
  if (!unique.length) {
    return imageOrder.map((focus, index) => ({ at: index / imageOrder.length, focus }))
  }
  unique[0] = { ...unique[0], at: 0 }
  return unique
}

export function normalizeShowcaseStory(raw, imageCount) {
  const count = Math.max(0, Math.trunc(Number(imageCount)) || 0)
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const imageOrder = normalizeImageOrder(source.imageOrder, count)
  return {
    schemaVersion: 2,
    storyMode: STORY_MODES.includes(source.storyMode) ? source.storyMode : count <= 1 ? 'hero' : 'sequential',
    imageOrder,
    beats: normalizeBeats(source.beats ?? source.phases, imageOrder),
    emphasis: EMPHASIS.includes(source.emphasis) ? source.emphasis : 'name',
  }
}

export function defaultShowcaseStory(imageCount) {
  return normalizeShowcaseStory({}, imageCount)
}

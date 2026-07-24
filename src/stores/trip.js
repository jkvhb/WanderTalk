import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { preset318 } from '../data/preset318'
import { preset318Narration } from '../data/preset318Narration'
import { isContentNode } from '../utils/contentNode'

// 单天结构归一化：保证 dayNumber 连续、路线元数据完整、segments 字段存在。
function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function cloneJsonValue(value) {
  if (Array.isArray(value)) return value.map(cloneJsonValue)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, cloneJsonValue(entry)]),
  )
}

function normalizeWaypoint(w) {
  if (!isRecord(w)) return null
  const waypoint = cloneJsonValue(w)
  return {
    ...waypoint,
    placeId: waypoint.placeId ?? '',
    narration: waypoint.narration ?? '',
    prevNarration: waypoint.prevNarration ?? '',
    narrate: waypoint.narrate ?? true,
    roles: Array.isArray(waypoint.roles) ? waypoint.roles : ['route'],
    routeType: waypoint.routeType ?? 'main',
    source: waypoint.source ?? null,
    address: waypoint.address ?? '',
    note: waypoint.note ?? '',
    images: Array.isArray(waypoint.images) ? waypoint.images : [],
    choreography: waypoint.choreography ?? null,
  }
}

function normalizeDay(day, i) {
  const source = isRecord(day) ? day : {}
  const normalized = cloneJsonValue(source)
  return {
    ...normalized,
    dayNumber: i + 1,
    overnight: normalized.overnight ?? '',
    overnightPlaceId: normalized.overnightPlaceId ?? '',
    alternatives: Array.isArray(normalized.alternatives) ? normalized.alternatives : [],
    waypoints: Array.isArray(source.waypoints)
      ? source.waypoints.map(normalizeWaypoint).filter(Boolean)
      : [],
    segments: normalized.segments ?? null,
  }
}

function normalizePlan(raw) {
  return {
    name: raw.name ?? '未命名路书',
    description: raw.description ?? '',
    voice: raw.voice ?? 'xiaoxiao',
    rate: typeof raw.rate === 'number' ? raw.rate : 1,
    days: (raw.days ?? []).map(normalizeDay),
  }
}

export const useTripStore = defineStore('trip', () => {
  const plan = ref(null)

  const dayCount = computed(() => plan.value?.days.length ?? 0)

  const allWaypoints = computed(() => {
    if (!plan.value) return []
    return plan.value.days.flatMap((d) => d.waypoints)
  })

  function findDay(dayNumber) {
    return plan.value?.days.find((d) => d.dayNumber === dayNumber)
  }

  function loadPreset318() {
    plan.value = normalizePlan(structuredClone(preset318))
  }

  function newEmptyPlan() {
    plan.value = normalizePlan({ name: '我的路书', days: [{}] })
  }

  function replacePlan(raw) {
    plan.value = normalizePlan(raw)
  }

  function clear() {
    plan.value = null
  }

  // —— 天编辑 ——
  function addDay() {
    if (!plan.value) return
    plan.value.days.push(normalizeDay({}, plan.value.days.length))
  }

  function removeDay(dayNumber) {
    if (!plan.value) return
    plan.value.days = plan.value.days
      .filter((d) => d.dayNumber !== dayNumber)
      .map(normalizeDay)
  }

  function setOvernight(dayNumber, name) {
    const day = findDay(dayNumber)
    if (day) day.overnight = name.trim()
  }

  // —— 节点编辑（节点增删/换序/改坐标都会让当天已算路线失效）——
  function addWaypoint(dayNumber, wp) {
    const day = findDay(dayNumber)
    if (!day) return
    const waypoint = normalizeWaypoint(wp)
    if (!waypoint) return
    day.waypoints.push(waypoint)
    day.segments = null
  }

  // 在指定下标插入节点（index 会被夹到 [0, length]）；当天路线失效。
  function insertWaypointAt(dayNumber, index, wp) {
    const day = findDay(dayNumber)
    if (!day) return
    const i = Math.max(0, Math.min(index, day.waypoints.length))
    const waypoint = normalizeWaypoint(wp)
    if (!waypoint) return
    day.waypoints.splice(i, 0, waypoint)
    day.segments = null
  }

  function removeWaypoint(dayNumber, index) {
    const day = findDay(dayNumber)
    if (!day) return
    day.waypoints.splice(index, 1)
    day.segments = null
  }

  function updateWaypoint(dayNumber, index, patch) {
    const day = findDay(dayNumber)
    const wp = day?.waypoints[index]
    if (!wp) return
    Object.assign(wp, patch)
    if ('lng' in patch || 'lat' in patch) day.segments = null
  }

  function moveWaypoint(dayNumber, index, dir) {
    const day = findDay(dayNumber)
    if (!day) return
    const target = index + dir
    if (target < 0 || target >= day.waypoints.length) return
    const [wp] = day.waypoints.splice(index, 1)
    day.waypoints.splice(target, 0, wp)
    day.segments = null
  }

  function setDaySegments(dayNumber, segments) {
    const day = findDay(dayNumber)
    if (day) day.segments = segments
  }

  // —— 旁白 ——
  function setNarration(dayNumber, index, text, { keepPrev = false } = {}) {
    const day = findDay(dayNumber)
    const wp = day?.waypoints[index]
    if (!wp) return
    if (keepPrev && wp.narration) wp.prevNarration = wp.narration
    wp.narration = text.trim()
  }

  // 在当前稿与上一稿之间切换（可来回对比）
  function restorePrevNarration(dayNumber, index) {
    const day = findDay(dayNumber)
    const wp = day?.waypoints[index]
    if (!wp || !wp.prevNarration) return
    const cur = wp.narration
    wp.narration = wp.prevNarration
    wp.prevNarration = cur
  }

  // —— 节点备注 / 图片（动画信息卡用）——
  function setNote(dayNumber, index, text) {
    const day = findDay(dayNumber)
    const wp = day?.waypoints[index]
    if (wp) wp.note = text.trim()
  }

  function addImage(dayNumber, index, imageId) {
    const day = findDay(dayNumber)
    const wp = day?.waypoints[index]
    if (!wp) return
    if (!Array.isArray(wp.images)) wp.images = []
    if (!wp.images.includes(imageId)) wp.images.push(imageId)
  }

  function removeImage(dayNumber, index, imageId) {
    const day = findDay(dayNumber)
    const wp = day?.waypoints[index]
    if (wp) wp.images = wp.images.filter((id) => id !== imageId)
  }

  function setImages(dayNumber, index, ids) {
    const day = findDay(dayNumber)
    const wp = day?.waypoints[index]
    if (wp) wp.images = [...ids]
  }

  // Phase 4e：编排动效配置（narrationHash 用于幂等——旁白没改的节点跳过重新生成）
  function setChoreography(dayNumber, index, { config, narrationHash }) {
    const day = findDay(dayNumber)
    const wp = day?.waypoints[index]
    if (wp) wp.choreography = { config, narrationHash }
  }

  function setVoice(slug) {
    if (plan.value) plan.value.voice = slug
  }

  function setRate(rate) {
    if (plan.value) plan.value.rate = Math.max(0.5, Math.min(2, rate))
  }

  function loadPresetNarration() {
    if (!plan.value) return
    for (const day of plan.value.days) {
      for (const wp of day.waypoints) {
        const text = preset318Narration[wp.name]
        if (isContentNode(wp) && text) wp.narration = text
      }
    }
  }

  // —— JSON 导入导出 ——
  function exportJson() {
    return JSON.stringify(plan.value, null, 2)
  }

  function importJson(text) {
    let raw
    try {
      raw = JSON.parse(text)
    } catch {
      throw new Error('不是有效的 JSON 文件')
    }
    if (!raw || !Array.isArray(raw.days)) {
      throw new Error('缺少 days 数组，不是有效的路书文件')
    }
    for (const day of raw.days) {
      for (const w of day.waypoints ?? []) {
        if (!w.name || typeof w.lng !== 'number' || typeof w.lat !== 'number') {
          throw new Error('路书数据格式错误：节点缺少 name / lng / lat')
        }
      }
    }
    plan.value = normalizePlan(raw)
  }

  return {
    plan,
    dayCount,
    allWaypoints,
    loadPreset318,
    newEmptyPlan,
    replacePlan,
    clear,
    addDay,
    removeDay,
    setOvernight,
    addWaypoint,
    insertWaypointAt,
    removeWaypoint,
    updateWaypoint,
    moveWaypoint,
    setDaySegments,
    setNarration,
    restorePrevNarration,
    setNote,
    addImage,
    removeImage,
    setImages,
    setChoreography,
    setVoice,
    setRate,
    loadPresetNarration,
    exportJson,
    importJson,
  }
})

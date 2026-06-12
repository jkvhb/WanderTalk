import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { preset318 } from '../data/preset318'

// 单天结构归一化：保证 dayNumber 连续、segments 字段存在。
function normalizeDay(day, i) {
  return {
    dayNumber: i + 1,
    overnight: day.overnight ?? '',
    waypoints: (day.waypoints ?? []).map((w) => ({ ...w })),
    segments: day.segments ?? null,
  }
}

function normalizePlan(raw) {
  return {
    name: raw.name ?? '未命名路书',
    description: raw.description ?? '',
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
    day.waypoints.push({ ...wp })
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
    removeWaypoint,
    updateWaypoint,
    moveWaypoint,
    setDaySegments,
    exportJson,
    importJson,
  }
})

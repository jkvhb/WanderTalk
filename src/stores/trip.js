import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { preset318 } from '../data/preset318'

export const useTripStore = defineStore('trip', () => {
  const plan = ref(null)

  const dayCount = computed(() => plan.value?.days.length ?? 0)

  const allWaypoints = computed(() => {
    if (!plan.value) return []
    return plan.value.days.flatMap((d) => d.waypoints)
  })

  function loadPreset318() {
    plan.value = structuredClone(preset318)
  }

  function clear() {
    plan.value = null
  }

  return { plan, dayCount, allWaypoints, loadPreset318, clear }
})

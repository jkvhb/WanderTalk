import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useTripStore } from './trip'
import { synthesize } from '../composables/useTts'
import { generateNarrationDraft } from '../composables/useNarration'

// 任务进度状态挂在 store（而非组件），切换视图时任务不中断、进度可续显。
function emptyJob() {
  return { running: false, done: 0, total: 0, error: '', finishedAt: null }
}

export const useStudioStore = defineStore('studio', () => {
  const synthJob = ref(emptyJob())
  const aiJob = ref(emptyJob())

  function narratedNodes(plan) {
    const out = []
    for (const day of plan.days) {
      day.waypoints.forEach((w, i) => {
        if (w.narration) out.push({ dayNumber: day.dayNumber, index: i, narration: w.narration })
      })
    }
    return out
  }

  function nodesForAi(plan, regenerateAll) {
    const out = []
    for (const day of plan.days) {
      day.waypoints.forEach((w, i) => {
        if (regenerateAll || !w.narration) {
          out.push({
            dayNumber: day.dayNumber,
            index: i,
            nodeName: w.name,
            overnight: day.overnight,
            altitude: w.altitude,
            prevName: day.waypoints[i - 1]?.name,
            nextName: day.waypoints[i + 1]?.name,
          })
        }
      })
    }
    return out
  }

  // 批量合成所有有旁白的节点（已缓存的秒回）
  async function runSynthAll() {
    const trip = useTripStore()
    if (!trip.plan || synthJob.value.running) return
    const nodes = narratedNodes(trip.plan)
    synthJob.value = { running: true, done: 0, total: nodes.length, error: '', finishedAt: null }
    try {
      for (const n of nodes) {
        await synthesize({ text: n.narration, voice: trip.plan.voice, rate: trip.plan.rate })
        synthJob.value.done++
      }
      synthJob.value.finishedAt = Date.now()
    } catch (e) {
      synthJob.value.error = e.message
    } finally {
      synthJob.value.running = false
    }
  }

  // AI 生成草稿；regenerateAll=false 只补空白，true 重生成全部（旧稿存入 prevNarration）
  async function runAiDraftAll(apiKey, { regenerateAll = false } = {}) {
    const trip = useTripStore()
    if (!trip.plan || aiJob.value.running) return
    const nodes = nodesForAi(trip.plan, regenerateAll)
    aiJob.value = { running: true, done: 0, total: nodes.length, error: '', finishedAt: null }
    try {
      if (nodes.length) {
        const results = await generateNarrationDraft(
          nodes.map((n) => ({
            nodeName: n.nodeName,
            dayNumber: n.dayNumber,
            overnight: n.overnight,
            altitude: n.altitude,
            prevName: n.prevName,
            nextName: n.nextName,
          })),
          { apiKey },
        )
        for (const r of results) {
          const day = trip.plan.days.find((d) => d.dayNumber === r.dayNumber)
          if (!day) continue
          // 优先匹配同名且（补空白模式下）尚无旁白的节点
          let idx = day.waypoints.findIndex((w) => w.name === r.nodeName && (regenerateAll || !w.narration))
          if (idx < 0) idx = day.waypoints.findIndex((w) => w.name === r.nodeName)
          if (idx >= 0 && r.narration) {
            trip.setNarration(r.dayNumber, idx, r.narration, { keepPrev: true })
            aiJob.value.done++
          }
        }
      }
      aiJob.value.finishedAt = Date.now()
    } catch (e) {
      aiJob.value.error = e.message
    } finally {
      aiJob.value.running = false
    }
  }

  return { synthJob, aiJob, runSynthAll, runAiDraftAll }
})

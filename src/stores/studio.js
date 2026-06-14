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

  // —— 试听播放器（全局单例：播新的自动停旧的，可手动暂停）——
  const playingKey = ref('')
  let audioEl = null
  function stopAudio() {
    if (audioEl) {
      try {
        audioEl.pause()
      } catch {
        /* 忽略 */
      }
      audioEl = null
    }
    playingKey.value = ''
  }
  async function play(key, blob) {
    stopAudio()
    audioEl = new Audio(URL.createObjectURL(blob))
    audioEl.addEventListener('ended', () => {
      if (playingKey.value === key) stopAudio()
    })
    playingKey.value = key
    await audioEl.play()
  }

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
            address: w.address,
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
        // nodes 已含 dayNumber/index/nodeName/address/altitude/overnight，整程一次性发后端
        const results = await generateNarrationDraft(nodes, { apiKey })
        for (const r of results) {
          const day = trip.plan.days.find((d) => d.dayNumber === r.dayNumber)
          if (!day) continue
          // 优先用回填的 index 精确定位，退化到按名称匹配
          let idx =
            typeof r.index === 'number' && r.index >= 0 && r.index < day.waypoints.length ? r.index : -1
          if (idx < 0) {
            idx = day.waypoints.findIndex((w) => w.name === r.nodeName && (regenerateAll || !w.narration))
            if (idx < 0) idx = day.waypoints.findIndex((w) => w.name === r.nodeName)
          }
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

  return { synthJob, aiJob, runSynthAll, runAiDraftAll, playingKey, play, stopAudio }
})

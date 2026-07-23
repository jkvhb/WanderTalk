import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useTripStore } from './trip'
import { synthesize } from '../composables/useTts'
import { generateNarrationDraft } from '../composables/useNarration'
import { generateImageQueries, searchPixabayImages, fetchPixabayImageBlob } from '../composables/useImages'
import { generateChoreographyConfigs } from '../composables/useChoreography'
import { pickImages } from '../utils/imageMatch'
import { downscaleImage, newImageId } from '../utils/image'
import { putImage } from '../utils/db'
import { hashKey } from '../utils/hash'
import { normalizeChoreography } from '../utils/choreography'
import { isContentNode } from '../utils/contentNode'

// 任务进度状态挂在 store（而非组件），切换视图时任务不中断、进度可续显。
function emptyJob() {
  return { running: false, done: 0, total: 0, error: '', finishedAt: null }
}

// imageJob 比通用 job 多 skipped（全部检索词落空的节点数）与 current（正在处理的节点名）
function emptyImageJob() {
  return { running: false, done: 0, total: 0, skipped: 0, current: '', error: '', finishedAt: null }
}

const IMAGES_PER_NODE = 3
const MATCH_THRESHOLD = 0.15
const CHOREO_NARRATION_MAX = 300 // 发给 LLM 的旁白截断长度（省 token，节奏判断够用）

// 与 FlightPlayer 的 plainNarration 同一剥法：SSML 标签（<break/> <emphasis> 等）不进 LLM 也不进 hash
function stripSsml(text) {
  return (text || '').replace(/<[^>]+>/g, '').trim()
}


// choreoJob 比通用 job 多 skipped（narrationHash 未变而跳过的节点数）
function emptyChoreoJob() {
  return { running: false, done: 0, total: 0, skipped: 0, error: '', finishedAt: null }
}

export const useStudioStore = defineStore('studio', () => {
  const synthJob = ref(emptyJob())
  const aiJob = ref(emptyJob())
  const imageJob = ref(emptyImageJob())
  const choreoJob = ref(emptyChoreoJob())

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
        if (!isContentNode(w)) return
        if (w.narration) out.push({ dayNumber: day.dayNumber, index: i, narration: w.narration })
      })
    }
    return out
  }

  function nodesForAi(plan, regenerateAll) {
    const out = []
    for (const day of plan.days) {
      day.waypoints.forEach((w, i) => {
        if (!isContentNode(w)) return
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

  function nodesNeedingImages(plan) {
    const out = []
    for (const day of plan.days) {
      day.waypoints.forEach((w, i) => {
        if (!isContentNode(w)) return
        if (!w.images?.length) {
          out.push({ dayNumber: day.dayNumber, index: i, name: w.name, address: w.address, note: w.note })
        }
      })
    }
    return out
  }

  // AI 自动配图：只填无图节点，每点最多 3 张（Pixabay，需下载入库、禁止热链）。
  // 幂等——重跑仍只处理"仍无图"的节点；单节点全部检索词落空则跳过（保持文字版）。
  async function runImageAutoFillAll(apiKey) {
    const trip = useTripStore()
    if (!trip.plan || imageJob.value.running) return
    const nodes = nodesNeedingImages(trip.plan)
    imageJob.value = { ...emptyImageJob(), running: true, total: nodes.length }
    try {
      if (nodes.length) {
        // 一次批量拿全部节点的检索词/互证关键词
        const queryResults = await generateImageQueries(nodes, { apiKey })
        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i]
          imageJob.value.current = node.name
          const q = queryResults?.find((r) => r.index === i) || queryResults?.[i]
          const queries = q?.queries || []
          const keywords = q?.keywords || []

          let picked = []
          for (const query of queries) {
            const hits = await searchPixabayImages(query, 'zh')
            picked = pickImages(hits, keywords, IMAGES_PER_NODE, MATCH_THRESHOLD)
            if (picked.length) break // 命中即止，不再尝试后续降级检索词
          }

          if (!picked.length) {
            imageJob.value.skipped++
            continue
          }

          for (const hit of picked) {
            const blob = await fetchPixabayImageBlob(hit.largeImageURL || hit.webformatURL)
            const { blob: small, mime, w, h } = await downscaleImage(blob)
            const id = newImageId()
            await putImage(id, {
              blob: small,
              mime,
              w,
              h,
              source: { provider: 'pixabay', id: hit.id, pageURL: hit.pageURL },
            })
            trip.addImage(node.dayNumber, node.index, id)
          }
          imageJob.value.done++
        }
      }
      imageJob.value.finishedAt = Date.now()
    } catch (e) {
      imageJob.value.error = e.message
    } finally {
      imageJob.value.running = false
    }
  }

  // 候选=有旁白且 ≥1 张图的节点（1 张也配：全屏微呼吸分支）；带当前旁白哈希供幂等比对
  function nodesForChoreography(plan) {
    const out = []
    for (const day of plan.days) {
      day.waypoints.forEach((w, i) => {
        if (!isContentNode(w)) return
        const plain = stripSsml(w.narration)
        if (!plain || !w.images?.length) return
        out.push({
          dayNumber: day.dayNumber,
          index: i,
          plain,
          imageCount: w.images.length,
          currentHash: hashKey(plain),
          storedHash: w.choreography?.narrationHash || '',
        })
      })
    }
    return out
  }

  // AI 编排动效：DeepSeek 一次批量为候选节点生成配置 → normalize → 存节点。
  // 按 narrationHash 幂等——旁白没改的节点跳过；LLM 漏回的节点 normalize 兜底默认配置。
  async function runChoreographyAll(apiKey, { force = false } = {}) {
    const trip = useTripStore()
    if (!trip.plan || choreoJob.value.running) return
    const candidates = nodesForChoreography(trip.plan)
    const toProcess = force ? candidates : candidates.filter((n) => n.currentHash !== n.storedHash)
    choreoJob.value = {
      ...emptyChoreoJob(),
      running: true,
      total: candidates.length,
      skipped: force ? 0 : candidates.length - toProcess.length,
    }
    try {
      if (toProcess.length) {
        const payload = toProcess.map((n, k) => ({
          index: k,
          narration: n.plain.slice(0, CHOREO_NARRATION_MAX),
          imageCount: n.imageCount,
        }))
        const results = await generateChoreographyConfigs(payload, { apiKey })
        toProcess.forEach((n, k) => {
          const raw = results?.find((r) => r.index === k) ?? results?.[k]
          const config = normalizeChoreography(raw, n.imageCount)
          trip.setChoreography(n.dayNumber, n.index, { config, narrationHash: n.currentHash })
          choreoJob.value.done++
        })
      }
      choreoJob.value.finishedAt = Date.now()
    } catch (e) {
      choreoJob.value.error = e.message
    } finally {
      choreoJob.value.running = false
    }
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

  return {
    synthJob,
    aiJob,
    imageJob,
    choreoJob,
    runSynthAll,
    runAiDraftAll,
    runImageAutoFillAll,
    runChoreographyAll,
    playingKey,
    play,
    stopAudio,
  }
})

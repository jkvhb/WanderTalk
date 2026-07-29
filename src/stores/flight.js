import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useTripStore } from './trip'
import { audioKey } from '../composables/useTts'
import { getCachedAudio } from '../utils/db'
import { collectNarratedStops, computeTotalDistance } from '../utils/flightStops'
import { buildFlightTimeline, sampleAt } from '../utils/flightTimeline'
import { formatDistance } from '../utils/format'
import { validatePlan } from '../utils/planValidation'

export const useFlightStore = defineStore('flight', () => {
  const timeline = ref(null)
  const audioBlobs = ref([]) // 按 stopIndex 索引的音频 Blob
  const t = ref(0)
  const playing = ref(false)
  const speed = ref(1)
  const sample = ref(null)
  const needsSynth = ref([])
  const error = ref('')

  const totalDuration = computed(() => timeline.value?.totalDuration ?? 0)
  const progress = computed(() => (totalDuration.value ? t.value / totalDuration.value : 0))

  let adapter = null
  let audioStop = -1
  let rafId = null

  // 收集有旁白节点 → 查音频缓存 → 装配时间轴。成功返回 true。
  async function buildFromPlan() {
    error.value = ''
    needsSynth.value = []
    const trip = useTripStore()
    if (!trip.plan) {
      error.value = '还没有路书'
      return false
    }
    const validationIssues = validatePlan(trip.plan)
    if (validationIssues.length) {
      error.value = `路书校验未通过：${validationIssues[0].message}`
      return false
    }
    const stops0 = collectNarratedStops(trip.plan)
    if (!stops0.length) {
      error.value = '没有任何带旁白的节点，请先在旁白工作台撰写并合成'
      return false
    }

    const { voice, rate } = trip.plan
    const stops = []
    const blobs = []
    const missing = []
    for (const s of stops0) {
      const cached = await getCachedAudio(audioKey(s.node.narration, voice, rate))
      if (cached && cached.blob && cached.blob.size > 0) {
        stops.push({ ...s, audioDuration: cached.duration })
        blobs.push(cached.blob)
      } else {
        missing.push(s.node.name)
      }
    }
    if (missing.length) {
      needsSynth.value = missing
      error.value = `有 ${missing.length} 个节点尚未合成语音，请先在旁白工作台「批量合成」`
      return false
    }

    const totalMeters = computeTotalDistance(trip.plan)
    const tl = buildFlightTimeline(stops, {
      intro: { title: trip.plan.name, subtitle: trip.plan.description },
      outro: {
        lines: [`共 ${trip.plan.days.length} 天`, `总里程约 ${formatDistance(totalMeters)}`, `${stops.length} 处讲解`],
      },
    })
    loadTimeline(tl, blobs)
    return true
  }

  // 直接载入已装配的时间轴与音频（buildFromPlan 内部用；也便于单测注入）
  function loadTimeline(tl, blobs) {
    timeline.value = tl
    audioBlobs.value = blobs || []
    t.value = 0
    audioStop = -1
    applySample()
  }

  // 把当前 t 的采样应用到 adapter：移动相机 + 按需播/停音频
  function applySample() {
    if (!timeline.value) return
    const s = sampleAt(timeline.value, t.value)
    sample.value = s
    if (!adapter) return
    adapter.setCamera(s.camera)
    adapter.setCar?.(s.car ?? null)
    adapter.setProgress?.(s.progress ?? null)
    if (s.audio.playing) {
      if (s.audio.stopIndex !== audioStop) {
        audioStop = s.audio.stopIndex
        const b = audioBlobs.value[audioStop]
        if (b) adapter.playAudio(b, s.audio.offset)
      }
    } else if (audioStop !== -1) {
      audioStop = -1
      adapter.stopAudio()
    }
  }

  function attach(a) {
    adapter = a
    applySample()
  }
  function detach() {
    pause()
    adapter = null
  }

  // 假时钟可直接调用；rAF 循环每帧也调它
  function tick(dt) {
    if (!playing.value || !timeline.value) return
    const nt = t.value + dt * speed.value
    if (nt >= timeline.value.totalDuration) {
      t.value = timeline.value.totalDuration
      playing.value = false
      applySample()
      return
    }
    t.value = nt
    applySample()
  }

  function startLoop() {
    if (typeof requestAnimationFrame === 'undefined') return // node 测试环境：靠手动 tick
    let prev = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const step = (ts) => {
      // 长帧探针（仅 dev）：>120ms 记下时间轴上下文，定位"卡顿发生在哪个场景/事件"。
      // 切后台再回来会出现一条巨长帧，属正常噪音
      if (import.meta.env.DEV && ts - prev > 120) {
        const s = sample.value
        console.warn(
          `[FlightPerf] 长帧 ${Math.round(ts - prev)}ms @ t=${t.value.toFixed(1)}s(${Math.floor(t.value / 60)}:${String(Math.floor(t.value % 60)).padStart(2, '0')}) ` +
            `phase=${s?.phase} stop=${s?.activeStopIndex} enter=${s?.showcase?.enterFrac?.toFixed(2) ?? '-'} ` +
            `narr=${s?.showcase?.narrationFrac?.toFixed(2) ?? '-'} exit=${s?.showcase?.exitFrac?.toFixed(2) ?? '-'}`,
        )
      }
      tick((ts - prev) / 1000)
      prev = ts
      if (playing.value) rafId = requestAnimationFrame(step)
    }
    rafId = requestAnimationFrame(step)
  }

  function play() {
    if (!timeline.value) return
    if (t.value >= timeline.value.totalDuration) {
      t.value = 0
      audioStop = -1
    }
    playing.value = true
    startLoop()
  }

  function pause() {
    playing.value = false
    if (rafId != null && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(rafId)
    rafId = null
    if (adapter) adapter.stopAudio()
    audioStop = -1
  }

  function seek(tv) {
    if (!timeline.value) return
    t.value = Math.max(0, Math.min(tv, timeline.value.totalDuration))
    audioStop = -1
    if (adapter) adapter.stopAudio()
    applySample()
  }

  function setSpeed(s) {
    speed.value = s
  }

  return {
    timeline, audioBlobs, t, playing, speed, sample, needsSynth, error,
    totalDuration, progress,
    buildFromPlan, loadTimeline, attach, detach, tick, play, pause, seek, setSpeed,
  }
})

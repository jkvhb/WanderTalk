<script setup>
import { ref } from 'vue'
import { useTripStore } from '../stores/trip'
import { synthesize } from '../composables/useTts'
import { generateNarrationDraft } from '../composables/useNarration'
import { useSettingsStore } from '../stores/settings'

const props = defineProps({
  day: { type: Object, required: true },
  color: { type: String, default: '#3b82f6' },
})

const trip = useTripStore()
const settings = useSettingsStore()
const expanded = ref(true)
const busy = ref('') // 当前操作中的「dayNumber-index」标记
const error = ref('')
let audioEl = null

async function preview(i) {
  const wp = props.day.waypoints[i]
  if (!wp.narration) return
  error.value = ''
  busy.value = `${props.day.dayNumber}-${i}`
  try {
    const { blob } = await synthesize({ text: wp.narration, voice: trip.plan.voice, rate: trip.plan.rate })
    if (audioEl) audioEl.pause()
    audioEl = new Audio(URL.createObjectURL(blob))
    await audioEl.play()
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = ''
  }
}

async function aiDraft(i) {
  const wp = props.day.waypoints[i]
  if (!settings.llmKey) {
    error.value = '请先在「设置」填写 DeepSeek API Key'
    return
  }
  error.value = ''
  busy.value = `${props.day.dayNumber}-${i}`
  try {
    const prev = props.day.waypoints[i - 1]?.name
    const next = props.day.waypoints[i + 1]?.name
    const [r] = await generateNarrationDraft(
      [
        {
          nodeName: wp.name,
          dayNumber: props.day.dayNumber,
          overnight: props.day.overnight,
          altitude: wp.altitude,
          prevName: prev,
          nextName: next,
        },
      ],
      { apiKey: settings.llmKey },
    )
    if (r?.narration) trip.setNarration(props.day.dayNumber, i, r.narration)
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = ''
  }
}
</script>

<template>
  <div class="rounded-lg border border-gray-100 overflow-hidden">
    <button
      class="w-full flex items-center gap-2 p-2.5 text-left hover:bg-gray-50 transition"
      @click="expanded = !expanded"
    >
      <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ background: color }"></span>
      <span class="text-sm font-medium flex-1">
        Day {{ day.dayNumber }}<template v-if="day.overnight"> · 宿{{ day.overnight }}</template>
      </span>
      <span class="text-gray-300 text-xs">{{ expanded ? '▲' : '▼' }}</span>
    </button>

    <div v-if="expanded" class="px-2.5 pb-2.5 space-y-2 border-t border-gray-50 pt-2">
      <p v-if="error" class="text-xs text-red-500">{{ error }}</p>
      <div v-for="(w, i) in day.waypoints" :key="i" class="space-y-1">
        <div class="flex items-center gap-2">
          <span class="text-xs font-medium flex-1 truncate">{{ w.name }}</span>
          <button
            class="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 transition disabled:opacity-40"
            :disabled="busy === `${day.dayNumber}-${i}`"
            title="AI 生成本段草稿"
            @click="aiDraft(i)"
          >AI</button>
          <button
            class="text-[11px] px-1.5 py-0.5 rounded bg-accent/10 text-accent hover:bg-accent/20 transition disabled:opacity-40"
            :disabled="!w.narration || busy === `${day.dayNumber}-${i}`"
            title="试听本段"
            @click="preview(i)"
          >▶ 试听</button>
        </div>
        <textarea
          :value="w.narration"
          @change="trip.setNarration(day.dayNumber, i, $event.target.value)"
          rows="2"
          placeholder="为该节点写讲解旁白，可用 <break/> <emphasis> SSML…"
          class="w-full px-2 py-1 rounded border border-gray-200 focus:border-accent focus:outline-none text-xs resize-y"
        ></textarea>
      </div>
    </div>
  </div>
</template>

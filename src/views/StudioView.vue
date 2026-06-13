<script setup>
import { ref, computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useTripStore } from '../stores/trip'
import { useSettingsStore } from '../stores/settings'
import { synthesize, VOICES } from '../composables/useTts'
import { generateNarrationDraft } from '../composables/useNarration'
import NarrationDayCard from '../components/NarrationDayCard.vue'

const trip = useTripStore()
const settings = useSettingsStore()

const DAY_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1']

const status = ref('')
const error = ref('')
const working = ref(false)

const narratedCount = computed(() => {
  if (!trip.plan) return 0
  return trip.plan.days.reduce((n, d) => n + d.waypoints.filter((w) => w.narration).length, 0)
})

function allNarratedItems() {
  const items = []
  for (const day of trip.plan.days) {
    day.waypoints.forEach((w, i) => {
      if (w.narration) {
        items.push({
          dayNumber: day.dayNumber,
          index: i,
          name: w.name,
          narration: w.narration,
          overnight: day.overnight,
          altitude: w.altitude,
          prevName: day.waypoints[i - 1]?.name,
          nextName: day.waypoints[i + 1]?.name,
        })
      }
    })
  }
  return items
}

async function synthAll() {
  if (!trip.plan || working.value) return
  error.value = ''
  working.value = true
  const items = allNarratedItems()
  let done = 0
  try {
    for (const it of items) {
      status.value = `合成中 ${++done}/${items.length}：${it.name}`
      await synthesize({ text: it.narration, voice: trip.plan.voice, rate: trip.plan.rate })
    }
    status.value = `完成：已合成 ${items.length} 段（命中缓存的已跳过）`
  } catch (e) {
    error.value = '批量合成失败：' + e.message + '（已成功的已缓存，可重试）'
  } finally {
    working.value = false
  }
}

async function aiDraftAll() {
  if (!trip.plan || working.value) return
  if (!settings.llmKey) {
    error.value = '请先在「设置」填写 DeepSeek API Key'
    return
  }
  error.value = ''
  working.value = true
  status.value = 'AI 生成全部草稿中…'
  try {
    const items = []
    for (const day of trip.plan.days) {
      day.waypoints.forEach((w, i) => {
        if (!w.narration) {
          items.push({
            nodeName: w.name,
            dayNumber: day.dayNumber,
            overnight: day.overnight,
            altitude: w.altitude,
            prevName: day.waypoints[i - 1]?.name,
            nextName: day.waypoints[i + 1]?.name,
          })
        }
      })
    }
    if (!items.length) {
      status.value = '所有节点都已有文案'
      return
    }
    const results = await generateNarrationDraft(items, { apiKey: settings.llmKey })
    for (const r of results) {
      const day = trip.plan.days.find((d) => d.dayNumber === r.dayNumber)
      const idx = day?.waypoints.findIndex((w) => w.name === r.nodeName && !w.narration)
      if (day && idx >= 0) trip.setNarration(r.dayNumber, idx, r.narration)
    }
    status.value = `AI 生成完成：${results.length} 段`
  } catch (e) {
    error.value = 'AI 生成失败：' + e.message
  } finally {
    working.value = false
  }
}
</script>

<template>
  <div class="flex h-full">
    <aside class="w-96 shrink-0 border-r border-black/5 bg-white/60 overflow-auto p-4 space-y-4">
      <h1 class="text-lg font-semibold">视频工作室 · 旁白</h1>

      <template v-if="trip.plan">
        <div class="space-y-2 rounded-lg border border-gray-100 p-3">
          <label class="flex items-center gap-2 text-xs text-gray-500">
            音色
            <select
              :value="trip.plan.voice"
              @change="trip.setVoice($event.target.value)"
              class="flex-1 px-2 py-1 rounded border border-gray-200 text-xs focus:outline-none focus:border-accent bg-white"
            >
              <option v-for="v in VOICES" :key="v.slug" :value="v.slug">{{ v.name }}</option>
            </select>
          </label>
          <label class="flex items-center gap-2 text-xs text-gray-500">
            语速 {{ trip.plan.rate.toFixed(1) }}x
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              :value="trip.plan.rate"
              @input="trip.setRate(Number($event.target.value))"
              class="flex-1"
            />
          </label>
          <p class="text-[11px] text-gray-400">已写旁白 {{ narratedCount }} 段</p>
        </div>

        <div class="space-y-2">
          <button
            @click="aiDraftAll"
            :disabled="working"
            class="w-full py-1.5 rounded-lg bg-gray-100 text-gray-600 text-sm hover:bg-gray-200 transition disabled:opacity-50"
          >AI 生成全部草稿</button>
          <button
            @click="trip.loadPresetNarration()"
            :disabled="working"
            class="w-full py-1.5 rounded-lg border border-gray-200 text-sm text-gray-500 hover:border-accent hover:text-accent transition disabled:opacity-50"
          >加载 318 预设文案</button>
          <button
            @click="synthAll"
            :disabled="working || narratedCount === 0"
            class="w-full py-1.5 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
          >批量合成全部旁白</button>
        </div>

        <p v-if="status" class="text-xs text-gray-500">{{ status }}</p>
        <p v-if="error" class="text-xs text-red-500">{{ error }}</p>

        <div class="space-y-2">
          <NarrationDayCard
            v-for="(day, i) in trip.plan.days"
            :key="day.dayNumber"
            :day="day"
            :color="DAY_COLORS[i % DAY_COLORS.length]"
          />
        </div>
      </template>

      <div v-else class="text-sm text-gray-400 space-y-2">
        <p>还没有路书。</p>
        <RouterLink to="/" class="text-accent">前往「路线规划」加载或编辑路线 →</RouterLink>
      </div>
    </aside>

    <div class="flex-1 flex items-center justify-center text-gray-300 text-sm p-6 text-center">
      旁白写好并合成后，Phase 4 将在这里用音频时长驱动飞行动画预览。
    </div>
  </div>
</template>

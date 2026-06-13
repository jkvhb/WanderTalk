<script setup>
import { ref, computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useTripStore } from '../stores/trip'
import { useSettingsStore } from '../stores/settings'
import { useStudioStore } from '../stores/studio'
import { VOICES } from '../composables/useTts'
import NarrationDayCard from '../components/NarrationDayCard.vue'

const trip = useTripStore()
const settings = useSettingsStore()
const studio = useStudioStore() // 任务进度挂在 store，切到别的视图再回来仍在继续、进度续显

const DAY_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1']

const uiError = ref('')

const narratedCount = computed(() => {
  if (!trip.plan) return 0
  return trip.plan.days.reduce((n, d) => n + d.waypoints.filter((w) => w.narration).length, 0)
})
const blanksExist = computed(
  () => !!trip.plan && trip.plan.days.some((d) => d.waypoints.some((w) => !w.narration)),
)

function aiAll() {
  uiError.value = ''
  if (!settings.llmKey) {
    uiError.value = '请先在「设置」填写 DeepSeek API Key'
    return
  }
  studio.runAiDraftAll(settings.llmKey, { regenerateAll: !blanksExist.value })
}

function synthAll() {
  uiError.value = ''
  studio.runSynthAll()
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

        <!-- AI 生成 -->
        <div class="space-y-1">
          <button
            @click="aiAll"
            :disabled="studio.aiJob.running"
            class="w-full py-1.5 rounded-lg bg-gray-100 text-gray-600 text-sm hover:bg-gray-200 transition disabled:opacity-50"
          >{{ blanksExist ? 'AI 生成全部草稿' : 'AI 重新生成全部' }}</button>
          <p v-if="studio.aiJob.running" class="text-[11px] text-gray-500">
            AI 生成中 {{ studio.aiJob.done }}/{{ studio.aiJob.total }}…
          </p>
          <p v-else-if="studio.aiJob.error" class="text-[11px] text-red-500">{{ studio.aiJob.error }}</p>
          <p v-else-if="studio.aiJob.finishedAt" class="text-[11px] text-green-600">
            ✓ 已生成完毕（{{ studio.aiJob.done }} 段）·再次点击重新生成（旧稿可一键切回）
          </p>
        </div>

        <button
          @click="trip.loadPresetNarration()"
          class="w-full py-1.5 rounded-lg border border-gray-200 text-sm text-gray-500 hover:border-accent hover:text-accent transition"
        >加载 318 预设文案</button>

        <!-- 批量合成 -->
        <div class="space-y-1">
          <button
            @click="synthAll"
            :disabled="studio.synthJob.running || narratedCount === 0"
            class="w-full py-1.5 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
          >批量合成全部旁白</button>
          <p v-if="studio.synthJob.running" class="text-[11px] text-gray-500">
            合成中 {{ studio.synthJob.done }}/{{ studio.synthJob.total }}…
          </p>
          <p v-else-if="studio.synthJob.error" class="text-[11px] text-red-500">
            {{ studio.synthJob.error }}（已成功的已缓存，可重试）
          </p>
          <p v-else-if="studio.synthJob.finishedAt" class="text-[11px] text-green-600">
            ✓ 已合成（{{ studio.synthJob.total }} 段，命中缓存已跳过）
          </p>
        </div>

        <p v-if="uiError" class="text-xs text-red-500">{{ uiError }}</p>

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

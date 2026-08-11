<script setup>
import { ref, reactive } from 'vue'
import { useTripStore } from '../stores/trip'
import { synthesize } from '../composables/useTts'
import { generateNarrationDraft } from '../composables/useNarration'
import { useSettingsStore } from '../stores/settings'
import { useStudioStore } from '../stores/studio'
import { downscaleImage, newImageId } from '../utils/image'
import { putImage, getImage, deleteImage } from '../utils/db'
import { missingLlmKeyMessage, resolveLlmRequest } from '../utils/llmRequest'

const props = defineProps({
  day: { type: Object, required: true },
  color: { type: String, default: '#3b82f6' },
})

const trip = useTripStore()
const settings = useSettingsStore()
const studio = useStudioStore()
const expanded = ref(true)
const busy = ref('') // 当前操作中的「dayNumber-index」标记
const error = ref('')

function nodeKey(i) {
  return `${props.day.dayNumber}-${i}`
}
function isPlaying(i) {
  return studio.playingKey === nodeKey(i)
}

async function preview(i) {
  if (isPlaying(i)) {
    studio.stopAudio() // 正在播这一段 → 暂停
    return
  }
  const wp = props.day.waypoints[i]
  if (!wp.narration) return
  error.value = ''
  busy.value = nodeKey(i)
  try {
    const { blob } = await synthesize({ text: wp.narration, voice: trip.plan.voice, rate: trip.plan.rate })
    await studio.play(nodeKey(i), blob) // 共享播放器：自动停掉上一段
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = ''
  }
}

async function aiDraft(i) {
  const wp = props.day.waypoints[i]
  const missingKey = missingLlmKeyMessage(settings)
  if (missingKey) {
    error.value = missingKey
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
          index: i,
          address: wp.address,
          overnight: props.day.overnight,
          altitude: wp.altitude,
          prevName: prev,
          nextName: next,
        },
      ],
      resolveLlmRequest(settings),
    )
    if (r?.narration) trip.setNarration(props.day.dayNumber, i, r.narration, { keepPrev: true })
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = ''
  }
}

// —— 节点图片：缩略图 objectURL 缓存（key=imageId）——
const thumbs = reactive({})
async function ensureThumb(id) {
  if (thumbs[id]) return
  const e = await getImage(id)
  if (e?.blob) thumbs[id] = URL.createObjectURL(e.blob)
}
function loadThumbs() {
  for (const w of props.day.waypoints) for (const id of w.images || []) ensureThumb(id)
}
loadThumbs()

async function onUpload(i, ev) {
  const files = Array.from(ev.target.files || [])
  ev.target.value = '' // 允许重复选同一文件
  error.value = ''
  busy.value = `${props.day.dayNumber}-${i}`
  try {
    for (const file of files) {
      const { blob, mime, w, h } = await downscaleImage(file)
      const id = newImageId()
      await putImage(id, { blob, mime, w, h })
      trip.addImage(props.day.dayNumber, i, id)
      await ensureThumb(id)
    }
  } catch (e) {
    error.value = '图片处理失败：' + e.message
  } finally {
    busy.value = ''
  }
}

async function onRemoveImage(i, id) {
  trip.removeImage(props.day.dayNumber, i, id)
  await deleteImage(id)
  if (thumbs[id]) {
    URL.revokeObjectURL(thumbs[id])
    delete thumbs[id]
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
            v-if="w.prevNarration"
            class="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 transition"
            title="切回上一稿（可来回切换对比）"
            @click="trip.restorePrevNarration(day.dayNumber, i)"
          >↩ 上一稿</button>
          <button
            class="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 transition disabled:opacity-40"
            :disabled="busy === `${day.dayNumber}-${i}`"
            title="AI 生成本段草稿"
            @click="aiDraft(i)"
          >AI</button>
          <button
            class="text-[11px] px-1.5 py-0.5 rounded bg-accent/10 text-accent hover:bg-accent/20 transition disabled:opacity-40"
            :disabled="busy === `${day.dayNumber}-${i}` || (!w.narration && !isPlaying(i))"
            :title="isPlaying(i) ? '暂停' : '试听本段'"
            @click="preview(i)"
          >{{ isPlaying(i) ? '⏸ 暂停' : busy === `${day.dayNumber}-${i}` ? '合成中…' : '▶ 试听' }}</button>
        </div>
        <textarea
          :value="w.narration"
          @change="trip.setNarration(day.dayNumber, i, $event.target.value)"
          rows="2"
          placeholder="为该节点写讲解旁白，可用 <break/> <emphasis> SSML…"
          class="w-full px-2 py-1 rounded border border-gray-200 focus:border-accent focus:outline-none text-xs resize-y"
        ></textarea>
        <textarea
          :value="w.note"
          @change="trip.setNote(day.dayNumber, i, $event.target.value)"
          rows="1"
          placeholder="节点备注（信息卡显示，可选）"
          class="w-full px-2 py-1 rounded border border-gray-100 focus:border-accent focus:outline-none text-[11px] resize-y text-gray-500"
        ></textarea>

        <div class="flex flex-wrap items-center gap-1.5">
          <div v-for="id in w.images" :key="id" class="relative group">
            <img v-if="thumbs[id]" :src="thumbs[id]" class="w-12 h-12 object-cover rounded border border-gray-200" alt="" />
            <div v-else class="w-12 h-12 rounded border border-gray-200 bg-gray-50"></div>
            <button
              class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-black/60 text-white text-[10px] leading-none opacity-0 group-hover:opacity-100 transition"
              title="删除图片"
              @click="onRemoveImage(i, id)"
            >×</button>
          </div>
          <label class="w-12 h-12 rounded border border-dashed border-gray-300 flex items-center justify-center text-gray-300 text-lg cursor-pointer hover:border-accent hover:text-accent transition">
            +
            <input type="file" accept="image/*" multiple class="hidden" @change="onUpload(i, $event)" />
          </label>
        </div>
      </div>
    </div>
  </div>
</template>

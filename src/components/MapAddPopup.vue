<script setup>
import { ref, computed, watch } from 'vue'
import { useTripStore } from '../stores/trip'

const props = defineProps({
  // 点中的候选地点（WGS-84）：{ name, address, lng, lat }
  candidate: { type: Object, required: true },
  // 浮窗在地图容器内的像素位置
  x: { type: Number, default: 16 },
  y: { type: Number, default: 16 },
  initialDay: { type: Number, default: 1 },
})

const emit = defineEmits(['confirm', 'cancel'])

const trip = useTripStore()
const selectedDay = ref(props.initialDay)
// 暂存插入位置（0..len）；null 表示尚未选择位置
const pendingIndex = ref(null)

const days = computed(() => trip.plan?.days ?? [])
const currentDay = computed(
  () => days.value.find((d) => d.dayNumber === selectedDay.value) || null,
)

// 切换目标天时，已暂存的位置作废（位置是按天计的）
watch(selectedDay, () => {
  pendingIndex.value = null
})

// 渲染列表：把候选项以「待添加」行插入到 pendingIndex 处
const rows = computed(() => {
  const wps = currentDay.value?.waypoints ?? []
  const base = wps.map((w, i) => ({ key: `w${i}`, name: w.name, index: i, pending: false }))
  if (pendingIndex.value != null) {
    base.splice(pendingIndex.value, 0, {
      key: 'pending',
      name: props.candidate.name,
      index: -1,
      pending: true,
    })
  }
  return base
})

const isEmpty = computed(() => (currentDay.value?.waypoints?.length ?? 0) === 0)

// 在某行「下面」插入 → 插入位置 = 该行原下标 + 1
function stageAfter(index) {
  pendingIndex.value = index + 1
}
function stageTop() {
  pendingIndex.value = 0
}
function unstage() {
  pendingIndex.value = null
}

function confirm() {
  if (pendingIndex.value == null) return
  emit('confirm', {
    dayNumber: selectedDay.value,
    index: pendingIndex.value,
    waypoint: {
      name: props.candidate.name,
      lng: props.candidate.lng,
      lat: props.candidate.lat,
    },
  })
}
</script>

<template>
  <div
    class="absolute z-30 w-64 max-h-[22rem] flex flex-col rounded-xl bg-white shadow-xl border border-black/5 overflow-hidden"
    :style="{ left: x + 'px', top: y + 'px' }"
  >
    <!-- 头部：候选地点 -->
    <div class="p-3 border-b border-gray-100">
      <div class="flex items-start gap-2">
        <div class="flex-1 min-w-0">
          <div class="text-sm font-semibold truncate">📍 {{ candidate.name }}</div>
          <div v-if="candidate.address" class="text-xs text-gray-400 truncate mt-0.5">
            {{ candidate.address }}
          </div>
        </div>
        <button
          class="shrink-0 text-gray-300 hover:text-gray-500 text-sm leading-none"
          title="取消"
          @click="emit('cancel')"
        >✕</button>
      </div>

      <label class="flex items-center gap-2 text-xs text-gray-500 mt-2">
        添加到
        <select
          v-model.number="selectedDay"
          class="flex-1 px-2 py-1 rounded border border-gray-200 text-xs focus:outline-none focus:border-accent bg-white"
        >
          <option v-for="d in days" :key="d.dayNumber" :value="d.dayNumber">
            Day {{ d.dayNumber }}{{ d.overnight ? ' · 宿' + d.overnight : '' }}
          </option>
        </select>
      </label>
    </div>

    <!-- 列表：点每行的 ＋ 把候选插到该行下面 -->
    <div class="flex-1 overflow-auto p-2 space-y-1">
      <p v-if="!isEmpty" class="text-[11px] text-gray-400 px-1">点某一行的 ＋ 把它插到该行下面：</p>

      <button
        v-if="!isEmpty"
        class="w-full text-left text-[11px] text-gray-400 hover:text-accent px-1 py-0.5"
        @click="stageTop"
      >↑ 插到最前面</button>

      <div
        v-for="row in rows"
        :key="row.key"
        :class="[
          'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition',
          row.pending ? 'bg-green-100/70 ring-1 ring-green-300' : 'bg-gray-50',
        ]"
      >
        <span class="flex-1 min-w-0 truncate" :class="row.pending ? 'text-green-700 font-medium' : ''">
          {{ row.name }}
          <span v-if="row.pending" class="text-[10px] text-green-600">（待添加）</span>
        </span>
        <button
          v-if="!row.pending"
          class="shrink-0 w-5 h-5 rounded-md bg-accent/10 text-accent hover:bg-accent/20 transition leading-none"
          title="插到这一行下面"
          @click="stageAfter(row.index)"
        >＋</button>
        <button
          v-else
          class="shrink-0 w-5 h-5 rounded-md text-green-600 hover:bg-green-200/60 transition leading-none"
          title="撤销暂存"
          @click="unstage"
        >✕</button>
      </div>

      <button
        v-if="isEmpty && pendingIndex == null"
        class="w-full rounded-md border border-dashed border-gray-300 text-xs text-gray-400 hover:border-accent hover:text-accent py-1.5 transition"
        @click="stageTop"
      >＋ 添加到这一天</button>
    </div>

    <!-- 底部：确定 / 取消 -->
    <div class="flex gap-2 p-2.5 border-t border-gray-100">
      <button
        class="flex-1 py-1.5 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-40"
        :disabled="pendingIndex == null"
        @click="confirm"
      >确定</button>
      <button
        class="flex-1 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-500 hover:border-gray-300 transition"
        @click="emit('cancel')"
      >取消</button>
    </div>
  </div>
</template>

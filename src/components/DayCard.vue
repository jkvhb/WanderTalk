<script setup>
import { ref, computed } from 'vue'
import draggable from 'vuedraggable'
import { useTripStore } from '../stores/trip'
import { formatDistance, formatDuration } from '../utils/format'

const props = defineProps({
  day: { type: Object, required: true },
  color: { type: String, default: '#3b82f6' },
})

const trip = useTripStore()
const expanded = ref(false)

const summary = computed(() => {
  const segs = props.day.segments
  if (!segs?.length) return null
  const dist = segs.reduce((s, x) => s + x.distance, 0)
  const dur = segs.reduce((s, x) => s + x.duration, 0)
  return `${formatDistance(dist)} · ${formatDuration(dur)}`
})

// vuedraggable 需要稳定唯一 key；名称可能重复，用 名称+坐标 组合
function wpKey(w) {
  return `${w.name}@${w.lng},${w.lat}`
}

// 拖拽改变顺序后，当天已算驾车路线失效（退回虚线，需重算）
function onReorder() {
  trip.setDaySegments(props.day.dayNumber, null)
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
      <span v-if="summary" class="text-xs text-gray-400 shrink-0">{{ summary }}</span>
      <span class="text-gray-300 text-xs">{{ expanded ? '▲' : '▼' }}</span>
    </button>

    <div v-if="!expanded" class="px-2.5 pb-2 text-xs text-gray-400 -mt-1">
      {{ day.waypoints.map((w) => w.name).join(' → ') || '暂无节点' }}
    </div>

    <div v-else class="px-2.5 pb-2.5 space-y-2 border-t border-gray-50 pt-2">
      <label class="flex items-center gap-2 text-xs text-gray-500">
        住宿地
        <input
          :value="day.overnight"
          @change="trip.setOvernight(day.dayNumber, $event.target.value)"
          class="flex-1 px-2 py-1 rounded border border-gray-200 focus:border-accent focus:outline-none text-xs"
          placeholder="如：康定"
        />
      </label>

      <draggable
        :list="day.waypoints"
        :item-key="wpKey"
        handle=".drag-handle"
        :animation="150"
        ghost-class="opacity-40"
        class="space-y-1"
        @change="onReorder"
      >
        <template #item="{ element: w, index: i }">
          <div class="flex items-center gap-1">
            <span
              class="drag-handle shrink-0 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 px-0.5"
              title="按住拖动排序"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round">
                <path d="M2.5 5h11M2.5 8h11M2.5 11h11" />
              </svg>
            </span>
            <span class="text-[10px] text-gray-300 w-3 text-right shrink-0">{{ i + 1 }}</span>
            <input
              :value="w.name"
              @change="trip.updateWaypoint(day.dayNumber, i, { name: $event.target.value })"
              class="flex-1 min-w-0 px-2 py-1 rounded border border-gray-200 focus:border-accent focus:outline-none text-xs"
            />
            <button
              class="text-gray-300 hover:text-red-500 px-0.5 shrink-0"
              title="删除节点"
              @click="trip.removeWaypoint(day.dayNumber, i)"
            >✕</button>
          </div>
        </template>
      </draggable>
      <p v-if="!day.waypoints.length" class="text-xs text-gray-400">
        在「搜索」中添加 POI，或用「点图添加节点」加入途经点。
      </p>

      <div v-if="day.segments?.length" class="space-y-0.5 pt-1 border-t border-gray-50">
        <p v-for="(s, i) in day.segments" :key="i" class="text-[11px] text-gray-400">
          {{ s.fromName }} → {{ s.toName }}：{{ formatDistance(s.distance) }} · {{ formatDuration(s.duration) }}
        </p>
      </div>

      <button
        class="text-xs text-red-400 hover:text-red-600 transition"
        @click="trip.removeDay(day.dayNumber)"
      >删除 Day {{ day.dayNumber }}</button>
    </div>
  </div>
</template>

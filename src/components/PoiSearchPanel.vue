<script setup>
import { ref } from 'vue'
import { loadAmap } from '../composables/useAmap'
import { useSettingsStore } from '../stores/settings'
import { amapErrorMessage } from '../utils/amapError'
import { useSearchHistory } from '../composables/useSearchHistory'

const settings = useSettingsStore()
const keyword = ref('')
const results = ref([])
const loading = ref(false)
const error = ref('')
const showHistory = ref(false)
const { history, add: addHistory, remove: removeHistory } = useSearchHistory()

function hideHistorySoon() {
  // 延迟关闭，让下拉项的点击先生效
  setTimeout(() => (showHistory.value = false), 150)
}
function pickHistory(h) {
  keyword.value = h
  showHistory.value = false
  search()
}

const categories = [
  { key: '', label: '全部' },
  { key: '餐饮', label: '🍜 餐饮' },
  { key: '酒店', label: '🏠 住宿' },
  { key: '景点', label: '📍 景点' },
  { key: '加油站', label: '⛽ 加油' },
]
const activeCat = ref('')

async function search() {
  if (!keyword.value.trim()) return
  addHistory(keyword.value)
  showHistory.value = false
  loading.value = true
  error.value = ''
  results.value = []
  try {
    const AMap = await loadAmap(settings.amapKey, settings.amapSecurityCode)
    const query = [activeCat.value, keyword.value].filter(Boolean).join(' ')
    const placeSearch = new AMap.PlaceSearch({ pageSize: 15, pageIndex: 1 })
    placeSearch.search(query, (status, result) => {
      loading.value = false
      if (status === 'complete' && result.poiList) {
        results.value = result.poiList.pois.map((p) => ({
          id: p.id,
          name: p.name,
          address: p.address,
          lng: p.location.lng,
          lat: p.location.lat,
        }))
      } else if (status === 'no_data') {
        error.value = '未找到结果'
      } else {
        // 打出原始结果便于进一步定位（Event / 字符串错误码等）
        console.error('[PlaceSearch] 搜索失败', { status, result })
        const info = amapErrorMessage(status, result)
        error.value = `搜索失败：${info}`
        if (/scode/i.test(info)) {
          error.value += '（请在「设置」中填写正确的高德安全密钥 securityJsCode）'
        }
      }
    })
  } catch (e) {
    loading.value = false
    error.value = e.message
  }
}

const emit = defineEmits(['select', 'add'])
</script>

<template>
  <div class="space-y-3">
    <div class="flex gap-2">
      <div class="relative flex-1">
        <input
          v-model="keyword"
          @keyup.enter="search"
          @focus="showHistory = true"
          @blur="hideHistorySoon"
          placeholder="搜索地点、餐厅、酒店…"
          class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-accent focus:outline-none text-sm"
        />
        <ul
          v-if="showHistory && history.length"
          class="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-100 rounded-lg shadow-lg overflow-hidden"
        >
          <li class="flex items-center justify-between px-3 py-1 text-[11px] text-gray-400 border-b border-gray-50">
            <span>历史搜索</span>
          </li>
          <li
            v-for="h in history"
            :key="h"
            class="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer"
            @mousedown.prevent="pickHistory(h)"
          >
            <span class="flex-1 truncate text-gray-600">🕘 {{ h }}</span>
            <button
              class="shrink-0 text-gray-300 hover:text-red-500 text-xs"
              title="删除该记录"
              @mousedown.prevent.stop="removeHistory(h)"
            >✕</button>
          </li>
        </ul>
      </div>
      <button
        @click="search"
        class="shrink-0 px-3 py-2 rounded-lg bg-accent text-white text-sm hover:opacity-90 transition"
      >
        搜索
      </button>
    </div>

    <div class="flex flex-wrap gap-1.5">
      <button
        v-for="c in categories"
        :key="c.key"
        @click="activeCat = c.key"
        :class="[
          'px-2.5 py-1 rounded-full text-xs transition',
          activeCat === c.key ? 'bg-accent text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
        ]"
      >
        {{ c.label }}
      </button>
    </div>

    <p v-if="loading" class="text-sm text-gray-400">搜索中…</p>
    <p v-if="error" class="text-sm text-red-500">{{ error }}</p>

    <ul class="space-y-1.5">
      <li
        v-for="r in results"
        :key="r.id"
        class="rounded-lg border border-gray-100 p-2.5 hover:border-accent/40 cursor-pointer transition"
        @click="emit('select', r)"
      >
        <div class="flex items-center gap-2">
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium">{{ r.name }}</div>
            <div class="text-xs text-gray-400 mt-0.5 truncate">{{ r.address || '无地址信息' }}</div>
          </div>
          <button
            class="shrink-0 text-xs px-2 py-1 rounded-md bg-accent/10 text-accent hover:bg-accent/20 transition"
            title="添加到路线"
            @click.stop="emit('add', r)"
          >＋</button>
        </div>
      </li>
    </ul>
  </div>
</template>

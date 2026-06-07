<script setup>
import { ref } from 'vue'
import { loadAmap } from '../composables/useAmap'
import { useSettingsStore } from '../stores/settings'

const settings = useSettingsStore()
const keyword = ref('')
const results = ref([])
const loading = ref(false)
const error = ref('')

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
  loading.value = true
  error.value = ''
  results.value = []
  try {
    const AMap = await loadAmap(settings.amapKey)
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
      } else {
        error.value = '未找到结果'
      }
    })
  } catch (e) {
    loading.value = false
    error.value = e.message
  }
}

const emit = defineEmits(['select'])
</script>

<template>
  <div class="space-y-3">
    <div class="flex gap-2">
      <input
        v-model="keyword"
        @keyup.enter="search"
        placeholder="搜索地点、餐厅、酒店…"
        class="flex-1 px-3 py-2 rounded-lg border border-gray-200 focus:border-accent focus:outline-none text-sm"
      />
      <button
        @click="search"
        class="px-3 py-2 rounded-lg bg-accent text-white text-sm hover:opacity-90 transition"
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
        <div class="text-sm font-medium">{{ r.name }}</div>
        <div class="text-xs text-gray-400 mt-0.5">{{ r.address || '无地址信息' }}</div>
      </li>
    </ul>
  </div>
</template>

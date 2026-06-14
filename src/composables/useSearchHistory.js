import { ref } from 'vue'

const KEY = '318:searchHistory'
const MAX = 8

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]')
  } catch {
    return []
  }
}
function save(arr) {
  try {
    localStorage.setItem(KEY, JSON.stringify(arr))
  } catch {
    /* 忽略（无 localStorage 时仅内存保存） */
  }
}

// 模块级单例：历史在组件重建后仍保留
const history = ref(load())

export function useSearchHistory() {
  function add(kw) {
    const k = (kw || '').trim()
    if (!k) return
    history.value = [k, ...history.value.filter((x) => x !== k)].slice(0, MAX)
    save(history.value)
  }
  function remove(kw) {
    history.value = history.value.filter((x) => x !== kw)
    save(history.value)
  }
  function clear() {
    history.value = []
    save(history.value)
  }
  return { history, add, remove, clear }
}

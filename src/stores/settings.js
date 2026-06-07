import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const KEYS = {
  amapKey: '318:amapKey',
  llmKey: '318:llmKey',
  voice: '318:voice',
}

export const useSettingsStore = defineStore('settings', () => {
  const amapKey = ref(localStorage.getItem(KEYS.amapKey) || '')
  const llmKey = ref(localStorage.getItem(KEYS.llmKey) || '')
  const voice = ref(localStorage.getItem(KEYS.voice) || 'xiaoxiao')

  const hasAmapKey = computed(() => amapKey.value.trim().length > 0)

  function setAmapKey(v) {
    amapKey.value = v.trim()
    localStorage.setItem(KEYS.amapKey, amapKey.value)
  }

  function setLlmKey(v) {
    llmKey.value = v.trim()
    localStorage.setItem(KEYS.llmKey, llmKey.value)
  }

  function setVoice(v) {
    voice.value = v
    localStorage.setItem(KEYS.voice, v)
  }

  return { amapKey, llmKey, voice, hasAmapKey, setAmapKey, setLlmKey, setVoice }
})

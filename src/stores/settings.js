import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const KEYS = {
  amapKey: '318:amapKey',
  amapSecurityCode: '318:amapSecurityCode',
  llmKey: '318:llmKey',
  voice: '318:voice',
}

export const useSettingsStore = defineStore('settings', () => {
  const amapKey = ref(localStorage.getItem(KEYS.amapKey) || '')
  const amapSecurityCode = ref(localStorage.getItem(KEYS.amapSecurityCode) || '')
  const llmKey = ref(localStorage.getItem(KEYS.llmKey) || '')
  const voice = ref(localStorage.getItem(KEYS.voice) || 'xiaoxiao')

  const hasAmapKey = computed(() => amapKey.value.trim().length > 0)

  function setAmapKey(v) {
    amapKey.value = v.trim()
    localStorage.setItem(KEYS.amapKey, amapKey.value)
  }

  function setAmapSecurityCode(v) {
    amapSecurityCode.value = v.trim()
    localStorage.setItem(KEYS.amapSecurityCode, amapSecurityCode.value)
  }

  function setLlmKey(v) {
    llmKey.value = v.trim()
    localStorage.setItem(KEYS.llmKey, llmKey.value)
  }

  function setVoice(v) {
    voice.value = v
    localStorage.setItem(KEYS.voice, v)
  }

  return {
    amapKey,
    amapSecurityCode,
    llmKey,
    voice,
    hasAmapKey,
    setAmapKey,
    setAmapSecurityCode,
    setLlmKey,
    setVoice,
  }
})

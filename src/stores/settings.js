import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const KEYS = {
  amapKey: '318:amapKey',
  amapSecurityCode: '318:amapSecurityCode',
  llmKey: '318:llmKey',
  kimiKey: '318:kimiKey',
  llmProvider: '318:llmProvider',
  voice: '318:voice',
  tiandituKey: '318:tiandituKey',
}

export const useSettingsStore = defineStore('settings', () => {
  const amapKey = ref(localStorage.getItem(KEYS.amapKey) || '')
  const amapSecurityCode = ref(localStorage.getItem(KEYS.amapSecurityCode) || '')
  const llmKey = ref(localStorage.getItem(KEYS.llmKey) || '')
  const kimiKey = ref(localStorage.getItem(KEYS.kimiKey) || '')
  const savedProvider = localStorage.getItem(KEYS.llmProvider)
  const llmProvider = ref(savedProvider === 'deepseek' ? 'deepseek' : 'kimi')
  const voice = ref(localStorage.getItem(KEYS.voice) || 'xiaoxiao')
  const tiandituKey = ref(localStorage.getItem(KEYS.tiandituKey) || '')

  const hasAmapKey = computed(() => amapKey.value.trim().length > 0)
  const hasTiandituKey = computed(() => tiandituKey.value.trim().length > 0)
  const needsDeepSeekKey = computed(() => llmProvider.value === 'deepseek' && !llmKey.value.trim())
  const hasKimiKey = computed(() => kimiKey.value.trim().length > 0)

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

  function setKimiKey(v) {
    kimiKey.value = v.trim()
    if (kimiKey.value) localStorage.setItem(KEYS.kimiKey, kimiKey.value)
    else localStorage.removeItem(KEYS.kimiKey)
  }

  function clearKimiKey() {
    kimiKey.value = ''
    localStorage.removeItem(KEYS.kimiKey)
  }

  function setLlmProvider(v) {
    llmProvider.value = v === 'deepseek' ? 'deepseek' : 'kimi'
    localStorage.setItem(KEYS.llmProvider, llmProvider.value)
  }

  function setVoice(v) {
    voice.value = v
    localStorage.setItem(KEYS.voice, v)
  }

  function setTiandituKey(v) {
    tiandituKey.value = v.trim()
    localStorage.setItem(KEYS.tiandituKey, tiandituKey.value)
  }

  return {
    amapKey,
    amapSecurityCode,
    llmKey,
    kimiKey,
    llmProvider,
    voice,
    tiandituKey,
    hasAmapKey,
    hasTiandituKey,
    needsDeepSeekKey,
    hasKimiKey,
    setAmapKey,
    setAmapSecurityCode,
    setLlmKey,
    setKimiKey,
    clearKimiKey,
    setLlmProvider,
    setVoice,
    setTiandituKey,
  }
})

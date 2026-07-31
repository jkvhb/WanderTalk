import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSettingsStore } from './settings'

describe('settings store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const store = {}
    vi.stubGlobal('localStorage', {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v) },
      removeItem: (k) => { delete store[k] },
    })
  })

  it('默认 amapKey 为空字符串', () => {
    const s = useSettingsStore()
    expect(s.amapKey).toBe('')
  })

  it('setAmapKey 后能从 localStorage 读回', () => {
    const s = useSettingsStore()
    s.setAmapKey('test-key-123')
    expect(s.amapKey).toBe('test-key-123')
    expect(localStorage.getItem('318:amapKey')).toBe('test-key-123')
  })

  it('hasAmapKey 反映 key 是否存在', () => {
    const s = useSettingsStore()
    expect(s.hasAmapKey).toBe(false)
    s.setAmapKey('abc')
    expect(s.hasAmapKey).toBe(true)
  })

  it('天地图 key：默认空、可写回 localStorage、hasTiandituKey 反映状态', () => {
    const s = useSettingsStore()
    expect(s.tiandituKey).toBe('')
    expect(s.hasTiandituKey).toBe(false)
    s.setTiandituKey('  tdt-123  ')
    expect(s.tiandituKey).toBe('tdt-123')
    expect(s.hasTiandituKey).toBe(true)
    expect(localStorage.getItem('318:tiandituKey')).toBe('tdt-123')
  })

  it('默认使用 Kimi，并可把 DeepSeek 作为手动备用保存', () => {
    const s = useSettingsStore()
    expect(s.llmProvider).toBe('kimi')
    s.setLlmProvider('deepseek')
    expect(s.llmProvider).toBe('deepseek')
    expect(localStorage.getItem('318:llmProvider')).toBe('deepseek')
  })
})

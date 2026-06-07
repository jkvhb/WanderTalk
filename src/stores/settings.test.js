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
})

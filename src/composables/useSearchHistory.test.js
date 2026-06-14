import { describe, it, expect, beforeEach } from 'vitest'
import { useSearchHistory } from './useSearchHistory'

describe('useSearchHistory', () => {
  beforeEach(() => useSearchHistory().clear())

  it('add 去重并置顶，remove 删除', () => {
    const { history, add, remove } = useSearchHistory()
    add('康定')
    add('折多山')
    add('康定')
    expect(history.value).toEqual(['康定', '折多山'])
    remove('折多山')
    expect(history.value).toEqual(['康定'])
  })

  it('空白不记录', () => {
    const { history, add } = useSearchHistory()
    add('   ')
    expect(history.value).toEqual([])
  })
})

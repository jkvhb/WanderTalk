import { describe, it, expect } from 'vitest'
import { newImageId } from './image'

describe('newImageId', () => {
  it('以 img_ 前缀开头', () => {
    expect(newImageId()).toMatch(/^img_/)
  })
  it('多次调用不重复', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newImageId()))
    expect(ids.size).toBe(50)
  })
})

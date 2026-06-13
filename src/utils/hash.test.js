import { describe, it, expect } from 'vitest'
import { hashKey } from './hash'

describe('hashKey', () => {
  it('确定性：同输入同输出', () => {
    expect(hashKey('abc')).toBe(hashKey('abc'))
  })
  it('不同输入不同输出', () => {
    expect(hashKey('abc')).not.toBe(hashKey('abd'))
  })
  it('返回非空十六进制字符串', () => {
    expect(hashKey('你好 xiaoxiao 1')).toMatch(/^[0-9a-f]+$/)
  })
})

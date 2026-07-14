import { describe, it, expect } from 'vitest'
import { hashString, mulberry32 } from './rand'
import { hashKey } from './hash'

describe('hashString', () => {
  it('确定性：同输入同输出', () => {
    expect(hashString('雅安：茶马古道的起点')).toBe(hashString('雅安：茶马古道的起点'))
  })

  it('不同输入产生不同种子', () => {
    expect(hashString('abc')).not.toBe(hashString('abd'))
  })

  it('返回 32 位无符号整数（可直接作 mulberry32 种子）', () => {
    const h = hashString('你好 318')
    expect(Number.isInteger(h)).toBe(true)
    expect(h).toBeGreaterThanOrEqual(0)
    expect(h).toBeLessThanOrEqual(0xffffffff)
  })

  it('与 hashKey（FNV-1a hex）同源：hex 解析后一致', () => {
    expect(hashString('稻城亚丁')).toBe(parseInt(hashKey('稻城亚丁'), 16) >>> 0)
  })
})

describe('mulberry32', () => {
  it('同 seed 产生完全相同的序列', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const seqA = Array.from({ length: 10 }, () => a())
    const seqB = Array.from({ length: 10 }, () => b())
    expect(seqA).toEqual(seqB)
  })

  it('不同 seed 产生不同序列', () => {
    const a = mulberry32(1)
    const b = mulberry32(2)
    const seqA = Array.from({ length: 5 }, () => a())
    const seqB = Array.from({ length: 5 }, () => b())
    expect(seqA).not.toEqual(seqB)
  })

  it('输出全部落在 [0,1)', () => {
    const rand = mulberry32(hashString('川藏线'))
    for (let i = 0; i < 1000; i++) {
      const v = rand()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('序列不是常数（有随机性）', () => {
    const rand = mulberry32(7)
    const seq = Array.from({ length: 20 }, () => rand())
    expect(new Set(seq).size).toBeGreaterThan(15)
  })
})

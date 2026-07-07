import { describe, it, expect } from 'vitest'
import { scoreImageMatch, pickImages } from './imageMatch'

describe('scoreImageMatch', () => {
  it('完全命中（关键词与标签相同）得满分', () => {
    expect(scoreImageMatch('tibet, mountain, sky', ['tibet', 'mountain'])).toBe(1)
  })

  it('子串宽松匹配：关键词是标签的子串（tibet 命中 tibetan）', () => {
    expect(scoreImageMatch('tibetan, plateau', ['tibet'])).toBeGreaterThan(0)
  })

  it('子串宽松匹配：标签是关键词的子串（反向）', () => {
    expect(scoreImageMatch('snow, plateau', ['snowy mountain'])).toBeGreaterThan(0)
  })

  it('大小写不敏感', () => {
    const a = scoreImageMatch('Tibet, Mountain', ['tibet', 'mountain'])
    const b = scoreImageMatch('tibet, mountain', ['TIBET', 'MOUNTAIN'])
    expect(a).toBe(b)
    expect(a).toBe(1)
  })

  it('无重叠得 0', () => {
    expect(scoreImageMatch('beach, ocean, sunset', ['tibet', 'mountain'])).toBe(0)
  })

  it('空标签得 0', () => {
    expect(scoreImageMatch('', ['tibet'])).toBe(0)
    expect(scoreImageMatch(null, ['tibet'])).toBe(0)
    expect(scoreImageMatch(undefined, ['tibet'])).toBe(0)
  })

  it('空关键词得 0', () => {
    expect(scoreImageMatch('tibet, mountain', [])).toBe(0)
    expect(scoreImageMatch('tibet, mountain', null)).toBe(0)
  })

  it('分数在 0~1 之间（部分命中）', () => {
    const score = scoreImageMatch('tibet, mountain, sky, cloud', ['tibet', 'ocean'])
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThan(1)
  })

  it('重复关键词不会重复计分超过 1', () => {
    const score = scoreImageMatch('tibet', ['tibet', 'tibet', 'tibet'])
    expect(score).toBeLessThanOrEqual(1)
  })
})

describe('pickImages', () => {
  const keywords = ['tibet', 'mountain']
  function hit(id, tags) {
    return { id, tags, webformatURL: `w${id}`, largeImageURL: `l${id}`, pageURL: `p${id}` }
  }

  it('按分数降序排列并取前 N', () => {
    const hits = [
      hit(1, 'beach, ocean'), // 0 分
      hit(2, 'tibet, mountain'), // 满分
      hit(3, 'tibet, sky'), // 中等分
    ]
    const out = pickImages(hits, keywords, 2, 0.15)
    expect(out.map((h) => h.id)).toEqual([2, 3])
  })

  it('过滤掉低于阈值的命中', () => {
    const hits = [hit(1, 'tibet, mountain'), hit(2, 'beach, ocean')]
    const out = pickImages(hits, keywords, 3, 0.15)
    expect(out.map((h) => h.id)).toEqual([1])
  })

  it('不足 N 张时返回实际有的数量', () => {
    const hits = [hit(1, 'tibet, mountain')]
    const out = pickImages(hits, keywords, 3, 0.15)
    expect(out).toHaveLength(1)
  })

  it('按 id 去重', () => {
    const hits = [hit(1, 'tibet, mountain'), hit(1, 'tibet, mountain'), hit(2, 'tibet, sky')]
    const out = pickImages(hits, keywords, 3, 0.15)
    expect(out.map((h) => h.id)).toEqual([1, 2])
  })

  it('空 hits 返回空数组', () => {
    expect(pickImages([], keywords, 3, 0.15)).toEqual([])
    expect(pickImages(null, keywords, 3, 0.15)).toEqual([])
  })

  it('count/threshold 有默认值', () => {
    const hits = [hit(1, 'tibet, mountain'), hit(2, 'tibet, sky'), hit(3, 'tibet, cloud'), hit(4, 'tibet, snow')]
    const out = pickImages(hits, keywords)
    expect(out.length).toBeLessThanOrEqual(3)
  })
})

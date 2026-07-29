import { describe, expect, it } from 'vitest'
import { normalizeShowcaseStory } from './showcaseStory'

describe('showcaseStory', () => {
  it('只保留 AI 输出中受控的讲解语义', () => {
    expect(normalizeShowcaseStory({
      schemaVersion: 2,
      storyMode: 'parallel',
      imageOrder: [2, 0, 99, 2],
      beats: [{ at: 0.8, focus: 0 }, { at: -1, focus: 2 }],
      emphasis: 'altitude',
      css: 'position:fixed',
    }, 3)).toEqual({
      schemaVersion: 2,
      storyMode: 'parallel',
      imageOrder: [2, 0, 1],
      beats: [{ at: 0, focus: 2 }, { at: 0.8, focus: 0 }],
      emphasis: 'altitude',
    })
  })

  it('把旧 phases 转成新 beats 并忽略旧转场', () => {
    const result = normalizeShowcaseStory({
      phases: [{ at: 0, focus: 1 }, { at: 0.6, focus: 0 }],
      transition: { enter: 'route-bloom', layout: 'hero-image' },
    }, 2)

    expect(result.schemaVersion).toBe(2)
    expect(result.beats).toEqual([{ at: 0, focus: 1 }, { at: 0.6, focus: 0 }])
    expect(result).not.toHaveProperty('transition')
  })
})

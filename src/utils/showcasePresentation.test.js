import { describe, expect, it } from 'vitest'
import {
  canCommitShowcaseLayout,
  shouldResolveShowcaseLayout,
  isShowcaseLayoutVisible,
} from './showcasePresentation'

describe('showcase presentation state', () => {
  it('最终布局未算好前不显示临时信息卡', () => {
    expect(isShowcaseLayoutVisible(4, -1)).toBe(false)
    expect(isShowcaseLayoutVisible(4, 4)).toBe(true)
  })

  it('镜头基本完成居中且图片加载完成后才解析最终布局', () => {
    const base = { stopIndex: 4, layoutReadyStop: -1, imagesReady: true }
    expect(shouldResolveShowcaseLayout({ ...base, enterFrac: 0.99 })).toBe(false)
    expect(shouldResolveShowcaseLayout({ ...base, enterFrac: 1 })).toBe(true)
    expect(shouldResolveShowcaseLayout({ ...base, enterFrac: 0.8, imagesReady: false })).toBe(false)
  })

  it('时间轴到达节点后仍等待地图引擎真正停止移动再定稿', () => {
    const base = {
      stopIndex: 4,
      layoutReadyStop: -1,
      imagesReady: true,
      enterFrac: 1,
    }
    expect(canCommitShowcaseLayout({ ...base, cameraSettled: false })).toBe(false)
    expect(canCommitShowcaseLayout({ ...base, cameraSettled: true })).toBe(true)
  })
})

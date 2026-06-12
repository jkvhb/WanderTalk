import { describe, it, expect } from 'vitest'
import { formatDistance, formatDuration } from './format'

describe('formatDistance', () => {
  it('小于 1km 显示米', () => {
    expect(formatDistance(850)).toBe('850m')
  })
  it('1km 以上保留一位小数', () => {
    expect(formatDistance(1500)).toBe('1.5km')
    expect(formatDistance(85300)).toBe('85.3km')
  })
  it('整数公里去掉 .0', () => {
    expect(formatDistance(2000)).toBe('2km')
  })
  it('100km 以上取整', () => {
    expect(formatDistance(176000)).toBe('176km')
  })
})

describe('formatDuration', () => {
  it('小于 1 小时显示分钟', () => {
    expect(formatDuration(300)).toBe('5分钟')
  })
  it('小时+分钟', () => {
    expect(formatDuration(18720)).toBe('5小时12分')
  })
  it('整小时', () => {
    expect(formatDuration(7200)).toBe('2小时')
  })
  it('分钟四舍五入到 60 时进位', () => {
    expect(formatDuration(7170)).toBe('2小时')
  })
})

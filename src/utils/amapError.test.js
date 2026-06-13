import { describe, it, expect } from 'vitest'
import { amapErrorMessage } from './amapError'

describe('amapErrorMessage', () => {
  it('字符串错误码原样返回', () => {
    expect(amapErrorMessage('error', 'USER_DAILY_QUERY_OVER_LIMIT')).toBe(
      'USER_DAILY_QUERY_OVER_LIMIT',
    )
  })

  it('从 result.info 提取', () => {
    expect(amapErrorMessage('error', { info: 'INVALID_USER_SCODE' })).toBe('INVALID_USER_SCODE')
  })

  it('Error 对象取 message', () => {
    expect(amapErrorMessage('error', new Error('boom'))).toBe('boom')
  })

  it('Event 结果给出安全密钥相关提示，不出现 [object Event]', () => {
    const msg = amapErrorMessage('error', new Event('error'))
    expect(msg).not.toMatch(/\[object/)
    expect(msg).toMatch(/安全密钥/)
  })

  it('空结果给出可操作提示而非 [object Object]', () => {
    expect(amapErrorMessage('error', {})).not.toMatch(/\[object/)
    expect(amapErrorMessage('error', null)).toMatch(/安全密钥|网络/)
  })
})

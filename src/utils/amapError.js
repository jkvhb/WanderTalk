// 从高德服务回调的 (status, result) 中提取可读错误信息。
// AMap web 服务插件（PlaceSearch/Driving/Geocoder）失败时，result 可能是：
//   - 字符串错误码（如 'USER_DAILY_QUERY_OVER_LIMIT'、'INVALID_USER_SCODE'）
//   - { info: '...' } 对象
//   - 一个 Event（JSONP 脚本 onerror）——通常意味着安全密钥未配置、
//     Key 与安全密钥不配套，或域名白名单/网络问题，此时拿不到具体错误码
//   - Error 对象
const FALLBACK_HINT =
  '请求被高德拒绝或网络异常（多为安全密钥 securityJsCode 未配置、Key 与安全密钥不配套，或域名白名单/网络问题）'

export function amapErrorMessage(status, result) {
  if (typeof result === 'string' && result.trim()) return result
  if (result && typeof result === 'object') {
    if (typeof result.info === 'string' && result.info.trim()) return result.info
    if (typeof result.message === 'string' && result.message.trim()) return result.message
  }
  if (typeof status === 'string' && status && status !== 'error' && status !== 'complete') {
    return status
  }
  return FALLBACK_HINT
}

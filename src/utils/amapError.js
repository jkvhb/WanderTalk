// 从高德服务回调的 (status, result) 中提取可读错误信息。
// AMap web 服务插件（PlaceSearch/Driving/Geocoder）失败时，result 可能是：
//   - 字符串错误码（如 'USER_DAILY_QUERY_OVER_LIMIT'、'INVALID_USER_SCODE'）
//   - { info: '...' } 对象
//   - 一个 Event（JSONP 脚本 onerror / 网络超时），有时被高德 toString 成 "[object Event]"
//   - Error 对象
const FALLBACK_HINT =
  '无法连接高德服务器——常见于网络异常、VPN/代理、防火墙拦截，或安全密钥/配额问题。请先关掉 VPN/代理再试，并在 Console 查看是否有 ERR_TIMED_OUT'

// 过滤无意义的串：空白，或被 toString 成 "[object ...]" 的对象/事件
function meaningful(s) {
  return typeof s === 'string' && s.trim() && !s.trim().startsWith('[object') ? s.trim() : ''
}

export function amapErrorMessage(status, result) {
  const direct = meaningful(typeof result === 'string' ? result : '')
  if (direct) return direct
  if (result && typeof result === 'object') {
    const info = meaningful(result.info)
    if (info) return info
    const msg = meaningful(result.message)
    if (msg) return msg
  }
  if (typeof status === 'string' && status && status !== 'error' && status !== 'complete') {
    return status
  }
  return FALLBACK_HINT
}

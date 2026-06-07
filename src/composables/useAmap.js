import AMapLoader from '@amap/amap-jsapi-loader'

let amapPromise = null

// 按 key 加载高德 JS API，单例缓存。
// securityCode 对应高德 JS API 2.0 的安全密钥（securityJsCode），
// PlaceSearch / Driving 等 Web 服务插件必须配置，否则请求会被拒绝。
export function loadAmap(key, securityCode) {
  if (!key) return Promise.reject(new Error('缺少高德 API Key'))
  if (amapPromise) return amapPromise

  // 必须在 AMapLoader.load 之前设置，供 2.0 Web 服务插件鉴权使用。
  if (securityCode) {
    window._AMapSecurityConfig = { securityJsCode: securityCode }
  }

  amapPromise = AMapLoader.load({
    key,
    version: '2.0',
    plugins: ['AMap.PlaceSearch', 'AMap.Driving', 'AMap.Scale', 'AMap.ToolBar'],
  })
  return amapPromise
}

// 测试或换 key 时重置。
export function resetAmap() {
  amapPromise = null
}

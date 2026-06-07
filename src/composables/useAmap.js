import AMapLoader from '@amap/amap-jsapi-loader'

let amapPromise = null

// 按 key 加载高德 JS API，单例缓存。
export function loadAmap(key) {
  if (!key) return Promise.reject(new Error('缺少高德 API Key'))
  if (amapPromise) return amapPromise
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

import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

// 天地图栅格瓦片（DataServer，Web Mercator "_w"）。MapLibre 不支持 {s}，手动展开子域 t0~t7。
// 用 DataServer 端点（参数少、最常用、最稳），img_w=影像、cia_w=中文注记。
function tdtTiles(layer, tk) {
  return ['0', '1', '2', '3', '4', '5', '6', '7'].map(
    (s) => `https://t${s}.tianditu.gov.cn/DataServer?T=${layer}_w&x={x}&y={y}&l={z}&tk=${tk}`,
  )
}

// 建一张只读（不可手势交互）的天地图，供逐帧 jumpTo 驱动。
export function createFlightMap({ container, tk, center = [102, 30], onError }) {
  const imgTiles = tdtTiles('img', tk)
  const ciaTiles = tdtTiles('cia', tk)
  // 诊断用：打印一条样例瓦片 URL，可直接在新标签页打开，测试瓦片是否可达
  console.info('[FlightMap] 样例瓦片 URL（可在新标签页打开自测）:', imgTiles[0].replace('{x}', '12').replace('{y}', '6').replace('{z}', '4'))

  const style = {
    version: 8,
    sources: {
      img: { type: 'raster', tiles: imgTiles, tileSize: 256 }, // 影像
      cia: { type: 'raster', tiles: ciaTiles, tileSize: 256 }, // 中文注记
    },
    layers: [
      // 背景层：瓦片未加载时显示深蓝而非纯黑（可据此区分"画布没渲染"还是"瓦片没加载"）
      { id: 'bg', type: 'background', paint: { 'background-color': '#0a1626' } },
      { id: 'img', type: 'raster', source: 'img' },
      { id: 'cia', type: 'raster', source: 'cia' },
    ],
  }

  const map = new maplibregl.Map({
    container,
    style,
    center,
    zoom: 8,
    pitch: 60,
    attributionControl: false,
    interactive: false, // 相机完全由动画驱动
  })

  // 加载完成后强制 resize 一次（应对异步挂载时容器尺寸尚未结算）
  map.on('load', () => map.resize())

  // 瓦片/样式出错：打到 console 便于排查，并上抛可读信息
  map.on('error', (e) => {
    console.error('[FlightMap error]', e?.error || e)
    if (onError) onError(e?.error?.message || '天地图瓦片加载失败（检查网络/VPN/key）')
  })

  function setCamera({ lng, lat, zoom, pitch, bearing }) {
    map.jumpTo({ center: [lng, lat], zoom, pitch, bearing: bearing ?? 0 })
  }

  // paths: [[ [lng,lat]... ], ...] 多段路线折线
  function drawRoute(paths) {
    const features = (paths || [])
      .filter((p) => p && p.length > 1)
      .map((p) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: p }, properties: {} }))
    const data = { type: 'FeatureCollection', features }
    const add = () => {
      if (map.getSource('route')) {
        map.getSource('route').setData(data)
        return
      }
      map.addSource('route', { type: 'geojson', data })
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        paint: { 'line-color': '#ff5a36', 'line-width': 3, 'line-opacity': 0.9 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      })
    }
    if (map.isStyleLoaded()) add()
    else map.once('load', add)
  }

  function destroy() {
    try {
      map.remove()
    } catch {
      /* 忽略 */
    }
  }

  return { map, setCamera, drawRoute, destroy }
}

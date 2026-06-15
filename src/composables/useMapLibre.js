import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

// 天地图 WMTS 瓦片（Web Mercator "w"）。MapLibre 不支持 {s}，手动展开子域 t0~t7。
function tdtTiles(layer, tk) {
  return ['0', '1', '2', '3', '4', '5', '6', '7'].map(
    (s) =>
      `https://t${s}.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0` +
      `&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles` +
      `&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${tk}`,
  )
}

// 建一张只读（不可手势交互）的天地图，供逐帧 jumpTo 驱动。
export function createFlightMap({ container, tk, center = [102, 30], onError }) {
  const style = {
    version: 8,
    sources: {
      img: { type: 'raster', tiles: tdtTiles('img', tk), tileSize: 256 }, // 影像
      cia: { type: 'raster', tiles: tdtTiles('cia', tk), tileSize: 256 }, // 中文注记
    },
    layers: [
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
  if (onError) map.on('error', (e) => onError(e?.error?.message || '天地图瓦片加载失败（检查网络/VPN/key）'))

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

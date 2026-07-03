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
//
// 关键：容器常在异步组件挂载 + flex/keep-alive 切换的那一拍里尺寸尚未结算，
// 若此时就 new Map，pitch:60 的画布会被锁死在 0/小尺寸而全黑，后续 resize() 难以救回。
// 因此改为「等容器 getBoundingClientRect 报出非零尺寸再建图」（读矩形会强制同步布局，
// 报出非零时布局必已结算），建图前把相机/路线暂存，建图后补放。
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
      dem: {
        // AWS Terrarium 高程瓦片：免费、全球、无需 key
        type: 'raster-dem',
        tiles: ['https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png'],
        tileSize: 256,
        encoding: 'terrarium',
        maxzoom: 14, // Terrarium 数据实际到 z15；再低会在高缩放时过采样变糊
      },
    },
    layers: [
      // 背景层：瓦片未加载时显示深蓝而非纯黑（可据此区分"画布没渲染"还是"瓦片没加载"）
      { id: 'bg', type: 'background', paint: { 'background-color': '#0a1626' } },
      { id: 'img', type: 'raster', source: 'img' },
      { id: 'cia', type: 'raster', source: 'cia' },
    ],
  }

  let map = null
  let ro = null
  let destroyed = false
  let pendingCamera = null
  let pendingRoute = null

  // 容器是否已拿到真实（非零）尺寸——读矩形会强制同步布局
  function hasSize() {
    const r = container?.getBoundingClientRect?.()
    return !!r && r.width > 0 && r.height > 0
  }

  function build() {
    if (map || destroyed) return
    map = new maplibregl.Map({
      container,
      style,
      center,
      zoom: 8,
      pitch: 60,
      attributionControl: false,
      interactive: false, // 相机完全由动画驱动
    })

    map.on('error', (e) => {
      // 地形相关错误一律降级不上抛：瓦片错误带 sourceId，terrain 内部错误只能靠 message 识别
      if (e?.sourceId === 'dem' || /terrain/i.test(e?.error?.message || '')) {
        console.warn('[FlightMap] 地形瓦片加载失败（不影响播放，平面继续）', e?.error || e)
        return
      }
      console.error('[FlightMap error]', e?.error || e)
      onError?.(e?.error?.message || String(e?.error || '未知错误'))
    })
    map.on('load', () => {
      map.resize() // 建图后再兜一次尺寸
      try {
        map.setTerrain({ source: 'dem', exaggeration: 1.4 }) // 用户确认 1.4
      } catch (err) {
        console.warn('[FlightMap] 3D 地形启用失败，降级平面继续', err)
      }
      if (pendingCamera) applyCamera(pendingCamera)
      if (pendingRoute) applyRoute(pendingRoute)
    })
  }

  // 尺寸已就绪则立即建图；否则用 ResizeObserver 等尺寸出现，并在之后任何尺寸变更时 resize。
  if (hasSize()) build()
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => {
      if (!map) {
        if (hasSize()) build()
      } else {
        map.resize()
      }
    })
    ro.observe(container)
  } else if (!map && typeof requestAnimationFrame !== 'undefined') {
    // 无 ResizeObserver 的兜底：逐帧轮询直到有尺寸
    const poll = () => {
      if (destroyed || map) return
      if (hasSize()) build()
      else requestAnimationFrame(poll)
    }
    requestAnimationFrame(poll)
  }

  function applyCamera({ lng, lat, zoom, pitch, bearing, padding }) {
    if (!map) return
    // padding.leftFrac（0~1，相对容器宽）→ 像素；节点因此偏向画面右侧
    const w = container.clientWidth || 0
    const left = Math.round((padding?.leftFrac ?? 0) * w)
    map.jumpTo({
      center: [lng, lat],
      zoom,
      pitch: pitch ?? 60,
      bearing: bearing ?? 0,
      padding: { top: 0, bottom: 0, left, right: 0 },
    })
  }
  function setCamera(cam) {
    if (!map) {
      pendingCamera = cam // 建图前只保留最新相机，建图后补放
      return
    }
    applyCamera(cam)
  }

  // paths: [[ [lng,lat]... ], ...] 多段路线折线
  function applyRoute(paths) {
    const features = (paths || [])
      .filter((p) => p && p.length > 1)
      .map((p) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: p }, properties: {} }))
    const data = { type: 'FeatureCollection', features }
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
  function drawRoute(paths) {
    if (!map) {
      pendingRoute = paths // 建图前暂存，建图 load 后补画
      return
    }
    if (map.isStyleLoaded()) applyRoute(paths)
    else map.once('load', () => applyRoute(paths))
  }

  // 经纬度 → 舞台容器内像素坐标（引线/脉冲标记锚点用）；未建图返回 null
  function project(lngLat) {
    if (!map) return null
    const p = map.project(lngLat)
    return { x: Math.round(p.x), y: Math.round(p.y) }
  }

  function destroy() {
    destroyed = true
    try {
      ro?.disconnect()
    } catch {
      /* 忽略 */
    }
    try {
      map?.remove()
    } catch {
      /* 忽略 */
    }
  }

  return {
    get map() {
      return map
    },
    setCamera,
    drawRoute,
    project,
    destroy,
  }
}

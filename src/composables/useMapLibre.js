import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { createCarElement } from '../assets/carMarker'
import { cameraTransitionFor, capCameraZoom } from '../utils/cameraTransition'

// 天地图栅格瓦片（DataServer，Web Mercator "_w"）。MapLibre 不支持 {s}，手动展开子域 t0~t7。
// 用 DataServer 端点（参数少、最常用、最稳），img_w=影像、cia_w=中文注记。
function tdtTiles(layer, tk) {
  return ['0', '1', '2', '3', '4', '5', '6', '7'].map(
    (s) => `https://t${s}.tianditu.gov.cn/DataServer?T=${layer}_w&x={x}&y={y}&l={z}&tk=${tk}`,
  )
}

// 路线进度配色：已走=青绿、未走=橙
const ROUTE_DONE = '#5DCAA5'
const ROUTE_TODO = '#ff5a36'

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
      const msg = e?.error?.message || ''
      // 地形相关错误一律降级不上抛：瓦片错误带 sourceId，terrain 内部错误只能靠 message 识别
      if (e?.sourceId === 'dem' || /terrain/i.test(msg)) {
        console.warn('[FlightMap] 地形瓦片加载失败（不影响播放，平面继续）', e?.error || e)
        return
      }
      // 429 = 天地图 QPS 瞬时限流（打开预览时斜视视野一次拉几百张瓦片），
      // MapLibre 会自动重试成功，属瞬态，不值得弹红色横幅吓用户
      if (/429|请求太多|Too Many Requests/i.test(msg)) {
        console.warn('[FlightMap] 瓦片限流(429)，稍后自动恢复', e?.error || e)
        return
      }
      console.error('[FlightMap error]', e?.error || e)
      onError?.(msg || String(e?.error || '未知错误'))
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
        // 容器尺寸变了，包围盒相机需按新尺寸重算（直接跳，不做滑动动画）
        if (lastBoundsCam) {
          lastBoundsSceneId = null
          applyCamera(lastBoundsCam, { animate: false })
        } else if (lastPointCam) {
          lastPointSceneId = null
          applyCamera(lastPointCam, { animate: false })
        }
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

  let lastBoundsSceneId = null
  let lastBoundsCam = null
  let lastPointSceneId = null
  let lastPointCam = null
  function applyCamera(cam, { animate = true } = {}) {
    if (!map) return
    if (cam?.kind === 'bounds') {
      if (!cam.bounds) return
      if (cam.sceneId != null && cam.sceneId === lastBoundsSceneId) return // 场景内相机静止
      const short = Math.min(container.clientWidth || 0, container.clientHeight || 0)
      let fitted = null
      try {
        // 注：cameraForBounds 按 bearing=0 平面拟合；pitch 由 jumpTo/flyTo 附加，
        // 25° 俯仰的形变靠 padFrac 外扩兜住（手测可调 boundsPadFrac）。
        fitted = map.cameraForBounds(cam.bounds, { padding: Math.round(short * (cam.padFrac ?? 0.15)) })
      } catch {
        /* 包围盒非法时保持原相机 */
      }
      if (!fitted) return
      const target = {
        center: fitted.center,
        zoom: capCameraZoom(fitted.zoom, { max: cam.maxZoom ?? 11.5 }),
        pitch: cam.pitch ?? 25,
        bearing: cam.bearing ?? 0,
        padding: { top: 0, bottom: 0, left: 0, right: 0 },
      }
      // 滑动时长由时间轴按场景给出（fly=min(3s, 段时长×70%)、outro=3s、intro/dwell 缺省瞬时）；
      // 首个相机/resize 重取景一律直接跳
      const easeMs = cam.easeMs ?? 0
      const transition = cameraTransitionFor(target, {
        animate,
        hasPrevious: !!(lastBoundsCam || lastPointCam),
        duration: easeMs,
      })
      map[transition.method](transition.options)
      lastBoundsSceneId = cam.sceneId ?? null
      lastBoundsCam = cam
      lastPointSceneId = null
      lastPointCam = null
      return
    }
    if (!cam || !Number.isFinite(cam.lng) || !Number.isFinite(cam.lat)) return
    if (cam.sceneId != null && cam.sceneId === lastPointSceneId) return
    const hasPrevious = !!(lastBoundsCam || lastPointCam)
    lastBoundsSceneId = null
    lastBoundsCam = null
    const w = container.clientWidth || 0
    const left = Math.round((cam.padding?.leftFrac ?? 0) * w)
    const target = {
      center: [cam.lng, cam.lat],
      zoom: capCameraZoom(cam.zoom, { max: cam.maxZoom ?? 10.2 }),
      pitch: cam.pitch ?? 25,
      bearing: cam.bearing ?? 0,
      padding: { top: 0, bottom: 0, left, right: 0 },
    }
    // 节点居中用 easeTo 直接插值到固定缩放；不用 flyTo 的弧线缩放，避免镜头穿入地形。
    if (animate && hasPrevious && (cam.easeMs ?? 0) > 0) {
      map.easeTo({ ...target, duration: cam.easeMs, essential: true })
    } else {
      map.jumpTo(target)
    }
    lastPointSceneId = cam.sceneId ?? null
    lastPointCam = cam
  }
  function setCamera(cam) {
    if (!map) {
      pendingCamera = cam // 建图前只保留最新相机，建图后补放
      return
    }
    applyCamera(cam)
  }

  const emptyFC = () => ({ type: 'FeatureCollection', features: [] })
  const fcOfLegs = (legs) => ({
    type: 'FeatureCollection',
    features: legs.map((p) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: p }, properties: {} })),
  })
  const lineOf = (p) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: p || [] }, properties: {} })

  let legPaths = []
  let curLegIndex = null
  // paths: 每站一条来路折线，与 stops 下标对齐（短/空段占位 null，保证 legIndex 对得上）
  function applyRoute(paths) {
    legPaths = (paths || []).map((p) => (p && p.length > 1 ? p : null))
    curLegIndex = null
    const ensure = (id, data, lineMetrics) => {
      if (map.getSource(id)) map.getSource(id).setData(data)
      else map.addSource(id, { type: 'geojson', data, ...(lineMetrics ? { lineMetrics: true } : {}) })
    }
    ensure('route-todo', fcOfLegs(legPaths.filter(Boolean)))
    ensure('route-done', emptyFC())
    ensure('route-current', lineOf([]), true) // lineMetrics：line-progress 渐变要用
    const layer = (id, source, paint) => {
      if (!map.getLayer(id)) {
        map.addLayer({ id, type: 'line', source, paint, layout: { 'line-cap': 'round', 'line-join': 'round' } })
      }
    }
    layer('route-todo-line', 'route-todo', { 'line-color': ROUTE_TODO, 'line-width': 3, 'line-opacity': 0.45 })
    layer('route-done-line', 'route-done', { 'line-color': ROUTE_DONE, 'line-width': 3.5, 'line-opacity': 0.95 })
    layer('route-current-line', 'route-current', {
      'line-width': 4,
      'line-gradient': ['step', ['line-progress'], ROUTE_DONE, 0.0000001, ROUTE_TODO],
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

  // 进度上色：progress={legIndex,frac}；null=复位全未走（seek 回 intro）
  function setProgress(progress) {
    if (!map || !map.getSource('route-current')) return
    if (!progress) {
      if (curLegIndex !== null) {
        curLegIndex = null
        map.getSource('route-todo').setData(fcOfLegs(legPaths.filter(Boolean)))
        map.getSource('route-done').setData(emptyFC())
        map.getSource('route-current').setData(lineOf([]))
      }
      return
    }
    const { legIndex, frac } = progress
    if (legIndex !== curLegIndex) {
      curLegIndex = legIndex
      map.getSource('route-done').setData(fcOfLegs(legPaths.slice(0, legIndex).filter(Boolean)))
      map.getSource('route-todo').setData(fcOfLegs(legPaths.slice(legIndex + 1).filter(Boolean)))
      map.getSource('route-current').setData(legPaths[legIndex] ? lineOf(legPaths[legIndex]) : lineOf([]))
    }
    const f = Math.min(Math.max(frac, 0.0000001), 1)
    map.setPaintProperty('route-current-line', 'line-gradient', ['step', ['line-progress'], ROUTE_DONE, f, ROUTE_TODO])
  }

  let carMarker = null
  let carApi = null
  let carFaceLeft = false
  function setCar(car) {
    if (!map) return
    if (!car) {
      if (carMarker) {
        carMarker.remove()
        carMarker = null
        carApi = null
        carFaceLeft = false
      }
      return
    }
    if (!carMarker) {
      carApi = createCarElement()
      // Marker 默认 viewport 对齐：车标直立、不随地图旋转/俯仰
      carMarker = new maplibregl.Marker({ element: carApi.el, anchor: 'bottom' })
        .setLngLat([car.lng, car.lat])
        .addTo(map)
    } else {
      carMarker.setLngLat([car.lng, car.lat])
    }
    // 车头默认朝右（东）、西半侧(180~360)朝左；带 ±10° 迟滞——
    // 南北向道路 heading 会在 0°/360° 与 180° 边界附近摆动，无迟滞会每帧左右闪烁
    const h = ((car.headingDeg % 360) + 360) % 360
    if (carFaceLeft) {
      if (h > 10 && h < 170) carFaceLeft = false // 明确进入东半侧才转回
    } else if (h > 190 && h < 350) {
      carFaceLeft = true // 明确进入西半侧才翻转
    }
    carApi.setFlip(carFaceLeft)
  }

  // 经纬度 → 舞台容器内像素坐标（引线/脉冲标记锚点用）；未建图返回 null
  function project(lngLat) {
    if (!map) return null
    const p = map.project(lngLat)
    return { x: Math.round(p.x), y: Math.round(p.y) }
  }

  // ?????????????????????????????????
  // ???/???? resolve(false)????????????????????
  function waitForTiles({ timeoutMs = 2500 } = {}) {
    return new Promise((resolve) => {
      if (!map) {
        resolve(false)
        return
      }
      if (map.areTilesLoaded?.()) {
        resolve(true)
        return
      }
      let settled = false
      let timer = null
      const finish = (ready) => {
        if (settled) return
        settled = true
        if (timer != null) clearTimeout(timer)
        try { map.off?.('idle', onIdle) } catch { /* ignore */ }
        resolve(ready)
      }
      const onIdle = () => finish(Boolean(map.areTilesLoaded?.() ?? true))
      try { map.on?.('idle', onIdle) } catch { finish(false); return }
      timer = setTimeout(() => finish(false), Math.max(0, timeoutMs))
    })
  }

  function destroy() {
    destroyed = true
    try {
      ro?.disconnect()
    } catch {
      /* 忽略 */
    }
    try {
      carMarker?.remove()
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
    setCar,
    setProgress,
    waitForTiles,
    destroy,
  }
}

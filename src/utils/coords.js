import coordtransform from 'coordtransform'

// 数据模型统一存 WGS-84；高德 API 输入输出为 GCJ-02。
// 所有跨坐标系的读写都必须经过本模块。

export function gcj02ToWgs84(lng, lat) {
  const [x, y] = coordtransform.gcj02towgs84(lng, lat)
  return { lng: x, lat: y }
}

export function wgs84ToGcj02(lng, lat) {
  const [x, y] = coordtransform.wgs84togcj02(lng, lat)
  return { lng: x, lat: y }
}

// path: [[lng, lat], ...]
export function wgs84PathToGcj02(path) {
  return path.map(([lng, lat]) => {
    const p = wgs84ToGcj02(lng, lat)
    return [p.lng, p.lat]
  })
}

export function gcj02PathToWgs84(path) {
  return path.map(([lng, lat]) => {
    const p = gcj02ToWgs84(lng, lat)
    return [p.lng, p.lat]
  })
}

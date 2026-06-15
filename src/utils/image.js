let counter = 0

// 唯一图片 id：时间戳 + 自增 + 随机，确保同一毫秒多次调用也不撞
export function newImageId() {
  counter = (counter + 1) % 1e6
  return `img_${Date.now().toString(36)}_${counter.toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

// 浏览器专用：把上传文件等比缩放到最长边 maxEdge，输出 JPEG。测试不覆盖（无 canvas）。
export async function downscaleImage(file, maxEdge = 1280, quality = 0.82) {
  const bitmap = await createImageBitmap(file)
  let w = bitmap.width
  let h = bitmap.height
  const scale = Math.min(1, maxEdge / Math.max(w, h))
  w = Math.round(w * scale)
  h = Math.round(h * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h)
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality))
  bitmap.close?.()
  return { blob, mime: 'image/jpeg', w, h }
}

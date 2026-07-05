// 卡通车标（用户拍板的唯一非写实元素）：直立、不随地图旋转/俯仰（游戏加载条式），
// 由 setFlip 按行进水平方向左右翻转（默认车头朝右/东）。
export function createCarElement(size = 44) {
  const el = document.createElement('div')
  el.style.width = `${size}px`
  el.style.height = `${size}px`
  el.style.pointerEvents = 'none'
  el.innerHTML = `<svg viewBox="0 0 44 44" width="${size}" height="${size}" style="display:block">
    <ellipse cx="22" cy="39" rx="15" ry="3" fill="rgba(0,0,0,0.3)"/>
    <path d="M13 19 Q15 10 22 10 Q30 10 32 19 Z" fill="#ff5a5a" stroke="#ffffff" stroke-width="2.5"/>
    <rect x="5" y="18" width="34" height="14" rx="7" fill="#ff5a5a" stroke="#ffffff" stroke-width="2.5"/>
    <path d="M16 18 Q17 13 22 13 Q27 13 28 18 Z" fill="#dff3ff"/>
    <circle cx="13" cy="33" r="5" fill="#2b2f36" stroke="#ffffff" stroke-width="2"/>
    <circle cx="31" cy="33" r="5" fill="#2b2f36" stroke="#ffffff" stroke-width="2"/>
    <circle cx="13" cy="33" r="1.8" fill="#cfd6df"/>
    <circle cx="31" cy="33" r="1.8" fill="#cfd6df"/>
  </svg>`
  const svg = el.firstElementChild
  return {
    el,
    setFlip(faceLeft) {
      svg.style.transform = faceLeft ? 'scaleX(-1)' : ''
    },
  }
}

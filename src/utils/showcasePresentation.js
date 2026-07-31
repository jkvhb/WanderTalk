// 镜头居中与展示页进入共用同一段时长；太早投影会把尚在移动的路线误判为占满安全区。
// 等镜头完成后再定稿素材轨；素材随后通过自身淡入衔接旁白。
export const SHOWCASE_LAYOUT_TRIGGER = 1

export function shouldResolveShowcaseLayout({
  enterFrac,
  stopIndex,
  layoutReadyStop,
  imagesReady,
}) {
  return (
    stopIndex != null &&
    imagesReady === true &&
    Number(enterFrac) >= SHOWCASE_LAYOUT_TRIGGER &&
    layoutReadyStop !== stopIndex
  )
}

export function canCommitShowcaseLayout(state) {
  return state?.cameraSettled === true && shouldResolveShowcaseLayout(state)
}

export function isShowcaseLayoutVisible(stopIndex, layoutReadyStop) {
  return stopIndex != null && stopIndex === layoutReadyStop
}

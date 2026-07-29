export const SHOWCASE_LAYOUT_TRIGGER = 0.6

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

export function isShowcaseLayoutVisible(stopIndex, layoutReadyStop) {
  return stopIndex != null && stopIndex === layoutReadyStop
}

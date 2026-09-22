import type { ViewState } from '../types'

export function clampView(view: ViewState, duration: number, width: number): ViewState {
  const minPx = duration > 0 && width > 0 ? width / duration : 1
  const pxPerSecond = Math.min(500, Math.max(minPx, view.pxPerSecond))
  const maxStart = Math.max(0, duration - width / pxPerSecond)
  return {
    pxPerSecond,
    start: Math.min(maxStart, Math.max(0, view.start)),
  }
}

/** 以指定 x 坐标处的时间为锚点缩放 */
export function zoomAt(
  view: ViewState,
  factor: number,
  anchorX: number,
  duration: number,
  width: number,
): ViewState {
  const anchor = view.start + anchorX / view.pxPerSecond
  const pxPerSecond = view.pxPerSecond * factor
  const start = anchor - anchorX / pxPerSecond
  return clampView({ start, pxPerSecond }, duration, width)
}

/** 适应整段音频 */
export function fitView(duration: number, width: number): ViewState {
  const pxPerSecond = duration > 0 ? (width - 16) / duration : 10
  return clampView({ start: 0, pxPerSecond: Math.max(pxPerSecond, 0.0001) }, duration, width)
}

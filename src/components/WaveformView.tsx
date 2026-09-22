import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Chapter, ViewState } from '../types'
import type { WaveformData } from '../audio/decode'
import { constrainCreate, constrainMove, constrainResize } from '../utils/chapters'
import { formatRulerTime } from '../utils/time'
import { clampView, fitView, zoomAt } from '../utils/view'

const RULER_H = 28
const WAVE_H = 112

type DragState =
  | {
      kind: 'create'
      pointerId: number
      anchorTime: number
      curTime: number
      draft: { start: number; end: number } | null
    }
  | {
      kind: 'move'
      pointerId: number
      id: string
      grabOffset: number
      start: number
      end: number
      snapTime: number | null
    }
  | {
      kind: 'resize'
      pointerId: number
      id: string
      edge: 'start' | 'end'
      start: number
      end: number
      snapTime: number | null
    }
  | {
      kind: 'pan'
      pointerId: number
      lastX: number
    }

export interface WaveformViewProps {
  waveform: WaveformData
  duration: number
  chapters: Chapter[]
  selectedId: string | null
  currentTime: number
  view: ViewState
  onViewChange: (v: ViewState) => void
  onSelect: (id: string | null) => void
  onSeek: (t: number) => void
  onCreate: (start: number, end: number) => void
  onCommitMove: (id: string, start: number, end: number) => void
  onCommitResize: (id: string, start: number, end: number) => void
}

interface LiveChapter {
  id: string
  start: number
  end: number
}

/** 选择标尺主刻度间隔（秒）：保证间隔至少约 80px */
function tickStep(pxPerSecond: number): { major: number; minor: number } {
  const targetPx = 90
  const targetSec = targetPx / pxPerSecond
  const nice = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600]
  const major = nice.find((s) => s >= targetSec) ?? 3600
  const minor = major / 5
  return { major, minor }
}

export default function WaveformView(props: WaveformViewProps) {
  const {
    waveform,
    duration,
    chapters,
    selectedId,
    currentTime,
    view,
    onViewChange,
    onSelect,
    onSeek,
    onCreate,
    onCommitMove,
    onCommitResize,
  } = props

  const surfaceRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(800)
  const dragRef = useRef<DragState | null>(null)
  const [, forceRedraw] = useState(0)
  const [live, setLive] = useState<LiveChapter | null>(null)
  const [snapLine, setSnapLine] = useState<number | null>(null)
  const [ghost, setGhost] = useState<{ start: number; end: number } | null>(null)

  // 拖拽期间使用最新值的 refs
  const viewRef = useRef(view)
  viewRef.current = view
  const chaptersRef = useRef(chapters)
  chaptersRef.current = chapters

  const timeToX = useCallback(
    (t: number) => (t - view.start) * view.pxPerSecond,
    [view],
  )
  const xToTime = useCallback((x: number) => viewRef.current.start + x / viewRef.current.pxPerSecond, [])

  const snapThreshold = useMemo(() => Math.min(0.25, 12 / view.pxPerSecond), [view.pxPerSecond])

  // 监听容器宽度（设备像素比适配）
  useEffect(() => {
    const el = surfaceRef.current
    if (!el) return
    const update = () => setWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 首次拿到容器宽度或加载新音频时，按真实宽度适应整段
  const fittedDurationRef = useRef<number | null>(null)
  useEffect(() => {
    if (width > 100 && fittedDurationRef.current !== duration) {
      fittedDurationRef.current = duration
      onViewChange(fitView(duration, width))
    }
  }, [width, duration, onViewChange])

  const height = RULER_H + WAVE_H

  // 绘制标尺与波形
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    // ---- 标尺背景 ----
    ctx.fillStyle = '#141a24'
    ctx.fillRect(0, 0, width, RULER_H)

    const { major, minor } = tickStep(view.pxPerSecond)
    const t0 = view.start
    const t1 = view.start + width / view.pxPerSecond

    // 次刻度
    ctx.strokeStyle = '#2a3342'
    ctx.lineWidth = 1
    ctx.beginPath()
    const firstMinor = Math.ceil(t0 / minor) * minor
    for (let t = firstMinor; t <= t1; t += minor) {
      const x = (t - t0) * view.pxPerSecond
      ctx.moveTo(x + 0.5, RULER_H - 5)
      ctx.lineTo(x + 0.5, RULER_H)
    }
    ctx.stroke()

    // 主刻度与文字
    ctx.fillStyle = '#7e8aa0'
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.textBaseline = 'middle'
    const firstMajor = Math.ceil(t0 / major) * major
    for (let t = firstMajor; t <= t1; t += major) {
      const x = (t - t0) * view.pxPerSecond
      ctx.strokeStyle = '#3a4658'
      ctx.beginPath()
      ctx.moveTo(x + 0.5, RULER_H - 10)
      ctx.lineTo(x + 0.5, RULER_H)
      ctx.stroke()
      ctx.fillText(formatRulerTime(t), x + 5, RULER_H / 2)
    }

    // ---- 波形区域背景 ----
    ctx.fillStyle = '#0d1119'
    ctx.fillRect(0, RULER_H, width, WAVE_H)

    const { peaks, bucketsPerSecond } = waveform
    const mid = RULER_H + WAVE_H / 2
    const firstBucket = Math.max(0, Math.floor(t0 * bucketsPerSecond))
    const lastBucket = Math.min(peaks.length - 1, Math.ceil(t1 * bucketsPerSecond))

    // 中线
    ctx.strokeStyle = '#1c2431'
    ctx.beginPath()
    ctx.moveTo(0, mid + 0.5)
    ctx.lineTo(width, mid + 0.5)
    ctx.stroke()

    const barW = Math.max(1, view.pxPerSecond / bucketsPerSecond)
    const playX = (currentTime - t0) * view.pxPerSecond

    // 未播放（基础）波形
    ctx.fillStyle = '#3b82f6'
    for (let b = firstBucket; b <= lastBucket; b++) {
      const t = b / bucketsPerSecond
      const x = (t - t0) * view.pxPerSecond
      const amp = peaks[b] * (WAVE_H / 2 - 3)
      ctx.fillRect(x, mid - amp, barW, amp * 2)
    }

    // 已播放部分（更亮）
    if (playX > 0) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, RULER_H, Math.min(playX, width), WAVE_H)
      ctx.clip()
      ctx.fillStyle = '#60a5fa'
      for (let b = firstBucket; b <= lastBucket; b++) {
        const t = b / bucketsPerSecond
        const x = (t - t0) * view.pxPerSecond
        if (x > playX) break
        const amp = peaks[b] * (WAVE_H / 2 - 3)
        ctx.fillRect(x, mid - amp, barW, amp * 2)
      }
      ctx.restore()
    }
  }, [waveform, width, height, view, currentTime])

  // 拖拽期间强制重绘（peaks 不变也刷新遮罩等）
  useEffect(() => {
    if (!dragRef.current) return
    forceRedraw((n) => n + 1)
  }, [live, ghost, snapLine])

  // ---------- 指针交互 ----------
  const localPoint = (e: PointerEvent | React.PointerEvent) => {
    const rect = surfaceRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const { x, y } = localPoint(e)

    // 标尺上按下 => 平移视图
    if (y <= RULER_H) {
      dragRef.current = { kind: 'pan', pointerId: e.pointerId, lastX: x }
      surfaceRef.current?.setPointerCapture?.(e.pointerId)
      return
    }

    // 检查是否点中边缘手柄或已有区间（由 DOM overlay 处理），
    // 落在空白波形上 => seek（点击）/ 创建（拖拽）
    const t = xToTime(x)
    dragRef.current = {
      kind: 'create',
      pointerId: e.pointerId,
      anchorTime: t,
      curTime: t,
      draft: null,
    }
    onSelect(null)
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  }

  const startMove = (e: React.PointerEvent, ch: Chapter) => {
    e.stopPropagation()
    const { x } = localPoint(e)
    onSelect(ch.id)
    dragRef.current = {
      kind: 'move',
      pointerId: e.pointerId,
      id: ch.id,
      grabOffset: xToTime(x) - ch.start,
      start: ch.start,
      end: ch.end,
      snapTime: null,
    }
    setLive({ id: ch.id, start: ch.start, end: ch.end })
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  }

  const startResize = (e: React.PointerEvent, ch: Chapter, edge: 'start' | 'end') => {
    e.stopPropagation()
    onSelect(ch.id)
    dragRef.current = {
      kind: 'resize',
      pointerId: e.pointerId,
      id: ch.id,
      edge,
      start: ch.start,
      end: ch.end,
      snapTime: null,
    }
    setLive({ id: ch.id, start: ch.start, end: ch.end })
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    const { x } = localPoint(e)

    if (drag.kind === 'pan') {
      const dx = x - drag.lastX
      drag.lastX = x
      const next = clampView(
        { ...viewRef.current, start: viewRef.current.start - dx / viewRef.current.pxPerSecond },
        duration,
        width,
      )
      onViewChange(next)
      return
    }

    if (drag.kind === 'create') {
      const t = Math.min(duration, Math.max(0, xToTime(x)))
      drag.curTime = t
      const rawA = drag.anchorTime
      const rawB = t
      // 拖拽距离太短先不建草稿
      if (Math.abs(rawB - rawA) * viewRef.current.pxPerSecond < 4) {
        setGhost({ start: Math.min(rawA, rawB), end: Math.max(rawA, rawB) })
        setLive(null)
        return
      }
      setGhost(null)
      const result = constrainCreate(chaptersRef.current, rawA, rawB, duration, snapThreshold)
      drag.draft = result ? { start: result.start, end: result.end } : null
      setLive(result ? { id: '__draft__', start: result.start, end: result.end } : null)
      return
    }

    if (drag.kind === 'move') {
      const desired = xToTime(x) - drag.grabOffset
      const r = constrainMove(chaptersRef.current, drag.id, desired, duration, snapThreshold)
      drag.start = r.start
      drag.end = r.end
      drag.snapTime = r.snapTime
      setLive({ id: drag.id, start: r.start, end: r.end })
      setSnapLine(r.snapTime)
      return
    }

    // resize
    const t = Math.min(duration, Math.max(0, xToTime(x)))
    const r = constrainResize(chaptersRef.current, drag.id, drag.edge, t, duration, snapThreshold)
    drag.start = r.start
    drag.end = r.end
    drag.snapTime = r.snapTime
    setLive({ id: drag.id, start: r.start, end: r.end })
    setSnapLine(r.snapTime)
  }

  const endDrag = (e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return

    if (drag.kind === 'create') {
      if (drag.draft) {
        onCreate(drag.draft.start, drag.draft.end)
      } else {
        // 视为点击：定位播放头
        const t = Math.min(duration, Math.max(0, xToTime(localPoint(e).x)))
        onSeek(t)
      }
    } else if (drag.kind === 'move') {
      onCommitMove(drag.id, drag.start, drag.end)
    } else if (drag.kind === 'resize') {
      onCommitResize(drag.id, drag.start, drag.end)
    }

    dragRef.current = null
    setLive(null)
    setGhost(null)
    setSnapLine(null)
  }

  // Ctrl/⌘ + 滚轮缩放；普通滚轮也缩放（以光标为锚点），标尺拖拽用于平移
  useEffect(() => {
    const el = surfaceRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const x = e.clientX - rect.left
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
      onViewChange(zoomAt(viewRef.current, factor, x, duration, width))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [duration, width, onViewChange])

  const zoomButton = (factor: number) =>
    onViewChange(zoomAt(view, factor, width / 2, duration, width))

  // 合并实时拖拽中的章节用于渲染
  const renderedChapters = useMemo(() => {
    if (!live) return chapters
    return chapters.map((c) => (c.id === live.id ? { ...c, start: live.start, end: live.end } : c))
  }, [chapters, live])

  const draftChapter =
    live?.id === '__draft__' ? live : ghost ? { id: '__ghost__', ...ghost } : null

  return (
    <div className="waveform-wrap">
      <div
        ref={surfaceRef}
        className="wave-surface"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <canvas ref={canvasRef} />

        {/* 区间层 */}
        {renderedChapters.map((ch) => {
          const left = timeToX(ch.start)
          const w = timeToX(ch.end) - left
          if (w < -2 || left > width) return null
          const selected = ch.id === selectedId
          return (
            <div
              key={ch.id}
              className={`region${selected ? ' region-selected' : ''}`}
              style={{ left, width: Math.max(2, w), top: RULER_H, height: WAVE_H }}
              onPointerDown={(e) => startMove(e, ch)}
            >
                <div className="region-label" title={ch.title}>
                  {ch.title || '未命名章节'}
                </div>
                <div
                  className="region-handle region-handle-l"
                  onPointerDown={(e) => startResize(e, ch, 'start')}
                />
                <div
                  className="region-handle region-handle-r"
                  onPointerDown={(e) => startResize(e, ch, 'end')}
                />
            </div>
          )
        })}

        {/* 拖拽创建中的草稿 */}
        {draftChapter && (
          <div
            className={draftChapter.id === '__ghost__' ? 'region region-ghost' : 'region region-draft'}
            style={{
              left: timeToX(draftChapter.start),
              width: Math.max(2, timeToX(draftChapter.end) - timeToX(draftChapter.start)),
              top: RULER_H,
              height: WAVE_H,
            }}
          />
        )}

        {/* 吸附指示线 */}
        {snapLine !== null && (
          <div
            className="snap-line"
            style={{ left: timeToX(snapLine), top: 0, height }}
          />
        )}

        {/* 播放头 */}
        <div
          className="playhead"
          style={{ left: timeToX(currentTime), top: 0, height }}
        >
          <div className="playhead-cap" />
        </div>

        {/* 缩放控件 */}
        <div className="zoom-controls" onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => zoomButton(1 / 1.4)} title="缩小">
            −
          </button>
          <button
            type="button"
            onClick={() => onViewChange(fitView(duration, width))}
            title="适应全部"
          >
            适配
          </button>
          <button type="button" onClick={() => zoomButton(1.4)} title="放大">
            +
          </button>
        </div>
      </div>
    </div>
  )
}

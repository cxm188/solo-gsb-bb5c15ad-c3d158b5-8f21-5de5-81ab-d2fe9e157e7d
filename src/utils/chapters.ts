import type { Chapter, SnapResult } from '../types'

export const MIN_DURATION = 0.25
const DEFAULT_SNAP_THRESHOLD = 0.12 // 秒

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v))

/** 在候选时间中寻找离 target 最近且在阈值内的时间 */
function findSnap(target: number, candidates: number[], threshold: number) {
  let best: number | null = null
  let bestDist = threshold
  for (const c of candidates) {
    const d = Math.abs(c - target)
    if (d <= bestDist + 1e-9) {
      bestDist = d
      best = c
    }
  }
  return best
}

/**
 * 基于区间原始位置确定其左右相邻章节边界：
 * left  = 最近的左邻章节结束时间（无则 0）
 * right = 最近的右邻章节开始时间（无则 duration）
 * 区间无论怎么移动/伸缩都无法穿过这两个邻居，从而保证不重叠。
 */
function neighborBounds(chapters: Chapter[], self: Chapter, duration: number) {
  let left = 0
  let right = duration
  for (const ch of chapters) {
    if (ch.id === self.id) continue
    if (ch.end <= self.start + 1e-9) left = Math.max(left, ch.end)
    if (ch.start >= self.end - 1e-9) right = Math.min(right, ch.start)
  }
  return { left, right }
}

/**
 * 移动整个章节区间：保持时长不变，自动吸附到邻近章节边界（含 0 与音频结尾），
 * 并阻止与其它章节重叠。
 */
export function constrainMove(
  chapters: Chapter[],
  id: string,
  desiredStart: number,
  duration: number,
  snapThreshold = DEFAULT_SNAP_THRESHOLD,
): SnapResult {
  const self = chapters.find((c) => c.id === id)
  if (!self) return { start: 0, end: MIN_DURATION, snapTime: null }

  const len = self.end - self.start
  const { left, right } = neighborBounds(chapters, self, duration)
  const lo = Math.max(0, left)
  const hi = Math.max(lo, right - len)

  let start = clamp(desiredStart, lo, hi)

  const candidates = [
    0,
    duration - len,
    ...chapters.filter((c) => c.id !== id).flatMap((c) => [c.end, c.start - len]),
  ]
  const snap = findSnap(start, candidates, snapThreshold)
  if (snap !== null) {
    const snapped = clamp(snap, lo, hi)
    // 吸附点落在当前可移动空隙内才采用
    if (Math.abs(snapped - snap) < 1e-9) start = snapped
  }

  return { start, end: start + len, snapTime: snap ?? null }
}

/**
 * 调整章节边缘。edge=start 时 desired 表示新的起点；edge=end 时表示新的终点。
 * 边缘会吸附到邻近边界，并保证最小时长、不重叠、不越界。
 */
export function constrainResize(
  chapters: Chapter[],
  id: string,
  edge: 'start' | 'end',
  desired: number,
  duration: number,
  snapThreshold = DEFAULT_SNAP_THRESHOLD,
): SnapResult {
  const self = chapters.find((c) => c.id === id)
  if (!self) return { start: 0, end: MIN_DURATION, snapTime: null }

  const { left, right } = neighborBounds(chapters, self, duration)

  if (edge === 'start') {
    const lo = Math.max(0, left)
    const hi = self.end - MIN_DURATION
    let start = clamp(desired, lo, hi)

    const candidates = [
      0,
      self.end - MIN_DURATION,
      ...chapters.filter((c) => c.id !== id).map((c) => c.end),
    ]
    const snap = findSnap(start, candidates, snapThreshold)
    if (snap !== null) {
      const snapped = clamp(snap, lo, hi)
      if (Math.abs(snapped - snap) < 1e-9) start = snapped
    }
    return { start, end: self.end, snapTime: snap ?? null }
  }

  const lo = self.start + MIN_DURATION
  const hi = Math.min(duration, right)
  let end = clamp(desired, lo, hi)

  const candidates = [
    duration,
    self.start + MIN_DURATION,
    ...chapters.filter((c) => c.id !== id).map((c) => c.start),
  ]
  const snap = findSnap(end, candidates, snapThreshold)
  if (snap !== null) {
    const snapped = clamp(snap, lo, hi)
    if (Math.abs(snapped - snap) < 1e-9) end = snapped
  }
  return { start: self.start, end, snapTime: snap ?? null }
}

/**
 * 拖拽创建新区间。在 [a, b] 内寻找不与已有章节重叠的空隙；
 * 若拖拽区间与已有章节相交则返回 null（阻止重叠）。
 */
export function constrainCreate(
  chapters: Chapter[],
  a: number,
  b: number,
  duration: number,
  snapThreshold = DEFAULT_SNAP_THRESHOLD,
): SnapResult | null {
  let start = Math.min(a, b)
  let end = Math.max(a, b)
  start = clamp(start, 0, duration)
  end = clamp(end, 0, duration)

  const startCandidates = [0, ...chapters.map((c) => c.end)]
  const endCandidates = [duration, ...chapters.map((c) => c.start)]
  const startSnap = findSnap(start, startCandidates, snapThreshold)
  const endSnap = findSnap(end, endCandidates, snapThreshold)
  if (startSnap !== null) start = startSnap
  if (endSnap !== null) end = endSnap
  if (end < start) [start, end] = [end, start]

  // 找到包含该区间的空隙 [gapStart, gapEnd]
  let gapStart = 0
  let gapEnd = duration
  for (const ch of chapters) {
    // 拖拽范围与任何已有章节相交 => 阻止创建
    if (ch.start < end && ch.end > start) return null
    if (ch.end <= start) gapStart = Math.max(gapStart, ch.end)
    if (ch.start >= end) gapEnd = Math.min(gapEnd, ch.start)
  }
  start = Math.max(start, gapStart)
  end = Math.min(end, gapEnd)
  if (end - start < MIN_DURATION) return null

  return { start, end, snapTime: null }
}

/** 键盘微调：直接平移 / 伸缩，夹到合法范围，不触发吸附（精确微调） */
export function nudgeChapter(
  chapters: Chapter[],
  id: string,
  delta: number,
  mode: 'move' | 'start' | 'end',
  duration: number,
): { start: number; end: number } {
  const self = chapters.find((c) => c.id === id)
  if (!self) return { start: 0, end: MIN_DURATION }

  const { left, right } = neighborBounds(chapters, self, duration)
  const len = self.end - self.start

  if (mode === 'move') {
    const lo = Math.max(0, left)
    const hi = Math.max(lo, right - len)
    const start = clamp(self.start + delta, lo, hi)
    return { start, end: start + len }
  }

  if (mode === 'start') {
    const lo = Math.max(0, left)
    const hi = self.end - MIN_DURATION
    const start = clamp(self.start + delta, lo, hi)
    return { start, end: self.end }
  }

  const lo = self.start + MIN_DURATION
  const hi = Math.min(duration, right)
  const end = clamp(self.end + delta, lo, hi)
  return { start: self.start, end }
}

export interface Chapter {
  id: string
  title: string
  /** 起始时间（秒） */
  start: number
  /** 结束时间（秒），与 start 之差受 minDuration 约束 */
  end: number
}

export interface ViewState {
  /** 视口左侧对应的时间（秒） */
  start: number
  /** 每秒对应的像素数 */
  pxPerSecond: number
}

export interface SnapResult {
  /** 约束后的区间 */
  start: number
  end: number
  /** 命中的吸附时间（秒），未命中为 null */
  snapTime: number | null
}

export type SortKey = 'time' | 'title'
export type SortDir = 'asc' | 'desc'

export interface ChapterJsonFile {
  format: 'podcast-chapters'
  version: 1
  duration: number | null
  chapters: Array<{ id: string; title: string; start: number; end: number }>
}

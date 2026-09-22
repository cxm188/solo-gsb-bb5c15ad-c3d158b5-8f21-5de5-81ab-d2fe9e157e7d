import type { Chapter, ChapterJsonFile } from '../types'
import { formatVttTime } from './time'

/** 生成 WebVTT 章节文件（NOTE 中附带结束时间，cue 文本为章节标题） */
export function buildWebVtt(chapters: Chapter[]): string {
  const sorted = [...chapters].sort((a, b) => a.start - b.start)
  const lines: string[] = ['WEBVTT', '']
  sorted.forEach((ch, i) => {
    lines.push(String(i + 1))
    lines.push(`${formatVttTime(ch.start)} --> ${formatVttTime(ch.end)}`)
    lines.push(ch.title.trim() || `章节 ${i + 1}`)
    lines.push('')
  })
  return lines.join('\n')
}

/** 生成 JSON 章节文件 */
export function buildJson(chapters: Chapter[], duration: number | null): string {
  const sorted = [...chapters].sort((a, b) => a.start - b.start)
  const payload: ChapterJsonFile = {
    format: 'podcast-chapters',
    version: 1,
    duration,
    chapters: sorted.map((ch) => ({
      id: ch.id,
      title: ch.title.trim() || '未命名章节',
      start: Number(ch.start.toFixed(3)),
      end: Number(ch.end.toFixed(3)),
    })),
  }
  return JSON.stringify(payload, null, 2)
}

/** 触发浏览器下载 */
export function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

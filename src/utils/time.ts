/** 将秒数格式化为 h:mm:ss.mmm（用于显示与编辑） */
export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0
  const totalMs = Math.round(seconds * 1000)
  const h = Math.floor(totalMs / 3_600_000)
  const m = Math.floor((totalMs % 3_600_000) / 60_000)
  const s = Math.floor((totalMs % 60_000) / 1000)
  const ms = totalMs % 1000
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  const mss = String(ms).padStart(3, '0')
  return `${h}:${mm}:${ss}.${mss}`
}

/** 将秒数格式化为 WebVTT 时间戳 HH:MM:SS.mmm */
export function formatVttTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0
  const totalMs = Math.round(seconds * 1000)
  const h = Math.floor(totalMs / 3_600_000)
  const m = Math.floor((totalMs % 3_600_000) / 60_000)
  const s = Math.floor((totalMs % 60_000) / 1000)
  const ms = totalMs % 1000
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(
    s,
  ).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

/**
 * 解析用户输入的时间。
 * 支持："mm:ss(.mmm)"、"hh:mm:ss(.mmm)"、"mm:ss.mmm" 以及纯秒数。
 * 解析失败返回 null。
 */
export function parseTime(input: string): number | null {
  const text = input.trim().replace('，', ',')
  if (!text) return null

  // 纯数字按秒处理
  if (/^\d+(\.\d+)?$/.test(text)) {
    const v = Number(text)
    return v >= 0 ? v : null
  }

  const m = text.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?(?:[.,](\d{1,3}))?$/)
  if (!m) return null
  const [, a, b, c, frac] = m
  let h = 0
  let mm = 0
  let ss = 0
  if (c !== undefined) {
    h = Number(a)
    mm = Number(b)
    ss = Number(c)
  } else {
    mm = Number(a)
    ss = Number(b)
  }
  if (mm >= 60 || ss >= 60) return null
  const fracSec = frac ? Number(frac.padEnd(3, '0')) / 1000 : 0
  return h * 3600 + mm * 60 + ss + fracSec
}

/** 标尺使用的短格式（少于 1 小时时省略小时） */
export function formatRulerTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(sec).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`
}

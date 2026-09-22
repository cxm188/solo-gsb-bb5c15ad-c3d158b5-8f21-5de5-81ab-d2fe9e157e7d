/** 轻量唯一 ID（无需外部依赖） */
export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `ch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

/** 从文件名推导导出文件的基础名（去掉扩展名） */
export function baseName(filename: string): string {
  return filename.replace(/\.[^.]+$/, '') || 'chapters'
}

import { useMemo, useState } from 'react'
import type { Chapter, SortDir, SortKey } from '../types'
import { formatTime, parseTime } from '../utils/time'

export interface ChapterListProps {
  chapters: Chapter[]
  duration: number
  selectedId: string | null
  previewId: string | null
  isPlaying: boolean
  onSelect: (id: string) => void
  onRename: (id: string, title: string) => void
  onEditTime: (id: string, edge: 'start' | 'end', value: number) => void
  onDelete: (id: string) => void
  onPreview: (id: string) => void
  onTogglePreview: () => void
  onStopPreview: () => void
}

export default function ChapterList(props: ChapterListProps) {
  const {
    chapters,
    duration,
    selectedId,
    previewId,
    isPlaying,
    onSelect,
    onRename,
    onEditTime,
    onDelete,
    onPreview,
    onTogglePreview,
    onStopPreview,
  } = props

  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('time')
  const [sortDir, setDir] = useState<SortDir>('asc')
  const [editingTime, setEditingTime] = useState<{ id: string; edge: 'start' | 'end' } | null>(null)
  const [timeDraft, setTimeDraft] = useState('')
  const [timeError, setTimeError] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = chapters
    if (q) {
      list = list.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          formatTime(c.start).includes(q) ||
          formatTime(c.end).includes(q),
      )
    }
    const sorted = [...list].sort((a, b) => {
      const cmp =
        sortKey === 'time'
          ? a.start - b.start
          : a.title.localeCompare(b.title, 'zh-CN')
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [chapters, query, sortKey, sortDir])

  const indexById = useMemo(() => {
    const byTime = [...chapters].sort((a, b) => a.start - b.start)
    return new Map(byTime.map((c, i) => [c.id, i + 1]))
  }, [chapters])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setDir('asc')
    }
  }

  const beginEditTime = (ch: Chapter, edge: 'start' | 'end') => {
    setEditingTime({ id: ch.id, edge })
    setTimeDraft(edge === 'start' ? formatTime(ch.start) : formatTime(ch.end))
    setTimeError(false)
  }

  const commitTime = () => {
    if (!editingTime) return
    const v = parseTime(timeDraft)
    if (v === null || v < 0 || v > duration) {
      setTimeError(true)
      return
    }
    onEditTime(editingTime.id, editingTime.edge, v)
    setEditingTime(null)
  }

  const sortArrow = (key: SortKey) =>
    sortKey !== key ? '' : sortDir === 'asc' ? ' ▲' : ' ▼'

  return (
    <aside className="chapter-panel">
      <div className="panel-header">
        <h2>章节列表</h2>
        <span className="chapter-count">{chapters.length} 段</span>
      </div>

      <div className="panel-controls">
        <input
          className="search-input"
          type="search"
          placeholder="搜索标题或时间…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="sort-buttons">
          <button
            type="button"
            className={sortKey === 'time' ? 'active' : ''}
            onClick={() => toggleSort('time')}
          >
            按时间{sortArrow('time')}
          </button>
          <button
            type="button"
            className={sortKey === 'title' ? 'active' : ''}
            onClick={() => toggleSort('title')}
          >
            按标题{sortArrow('title')}
          </button>
        </div>
      </div>

      <ul className="chapter-items">
        {filtered.length === 0 && (
          <li className="chapter-empty">
            {chapters.length === 0
              ? '在波形上拖出一段区间即可创建章节'
              : '没有匹配的章节'}
          </li>
        )}
        {filtered.map((ch) => {
          const selected = ch.id === selectedId
          const previewing = ch.id === previewId
          return (
            <li
              key={ch.id}
              className={`chapter-item${selected ? ' selected' : ''}${
                previewing ? ' previewing' : ''
              }`}
              onClick={() => onSelect(ch.id)}
            >
              <div className="chapter-item-top">
                <span className="chapter-index">#{indexById.get(ch.id)}</span>
                <input
                  className="chapter-title-input"
                  value={ch.title}
                  placeholder={`章节 ${indexById.get(ch.id)}`}
                  onChange={(e) => onRename(ch.id, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <div className="chapter-item-times" onClick={(e) => e.stopPropagation()}>
                {editingTime?.id === ch.id && editingTime.edge === 'start' ? (
                  <input
                    autoFocus
                    className={`time-edit${timeError ? ' error' : ''}`}
                    value={timeDraft}
                    onChange={(e) => setTimeDraft(e.target.value)}
                    onBlur={commitTime}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitTime()
                      if (e.key === 'Escape') setEditingTime(null)
                    }}
                    title="格式 h:mm:ss.mmm，回车确认"
                  />
                ) : (
                  <button
                    type="button"
                    className="time-chip"
                    onClick={() => beginEditTime(ch, 'start')}
                    title="点击编辑开始时间"
                  >
                    {formatTime(ch.start)}
                  </button>
                )}
                <span className="time-sep">→</span>
                {editingTime?.id === ch.id && editingTime.edge === 'end' ? (
                  <input
                    autoFocus
                    className={`time-edit${timeError ? 'error' : ''}`}
                    value={timeDraft}
                    onChange={(e) => setTimeDraft(e.target.value)}
                    onBlur={commitTime}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitTime()
                      if (e.key === 'Escape') setEditingTime(null)
                    }}
                    title="格式 h:mm:ss.mmm，回车确认"
                  />
                ) : (
                  <button
                    type="button"
                    className="time-chip"
                    onClick={() => beginEditTime(ch, 'end')}
                    title="点击编辑结束时间"
                  >
                    {formatTime(ch.end)}
                  </button>
                )}
                <span className="chapter-dur">{(ch.end - ch.start).toFixed(2)}s</span>
              </div>
              <div className="chapter-item-actions" onClick={(e) => e.stopPropagation()}>
                {previewing ? (
                  <>
                    <button
                      type="button"
                      className="btn small"
                      onClick={onTogglePreview}
                      title="播放 / 暂停"
                    >
                      {isPlaying ? '⏸ 暂停' : '▶ 继续'}
                    </button>
                    <button
                      type="button"
                      className="btn small danger"
                      onClick={onStopPreview}
                      title="停止预览"
                    >
                      ■ 停止
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => onPreview(ch.id)}
                    title="播放该章节片段"
                  >
                    ▶ 预览
                  </button>
                )}
                <button
                  type="button"
                  className="btn small ghost"
                  onClick={() => onDelete(ch.id)}
                  title="删除章节 (Delete)"
                >
                  删除
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}

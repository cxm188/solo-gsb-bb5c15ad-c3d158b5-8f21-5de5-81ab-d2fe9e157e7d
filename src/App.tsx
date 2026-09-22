import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Transport from './components/Transport'
import WaveformView from './components/WaveformView'
import ChapterList from './components/ChapterList'
import type { Chapter, ViewState } from './types'
import { buildWaveform, decodeAudioFile, type WaveformData } from './audio/decode'
import { constrainResize, nudgeChapter } from './utils/chapters'
import { clampView, fitView } from './utils/view'
import { uid, baseName } from './utils/misc'
import { buildJson, buildWebVtt, downloadFile } from './utils/exporter'

export default function App() {
  const [fileName, setFileName] = useState<string | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [waveform, setWaveform] = useState<WaveformData | null>(null)
  const [duration, setDuration] = useState(0)
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [view, setView] = useState<ViewState>({ start: 0, pxPerSecond: 10 })
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [loopPreview, setLoopPreview] = useState(true)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [draggingFile, setDraggingFile] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const chaptersRef = useRef(chapters)
  chaptersRef.current = chapters
  const previewIdRef = useRef(previewId)
  previewIdRef.current = previewId
  const loopRef = useRef(loopPreview)
  loopRef.current = loopPreview

  const selected = useMemo(
    () => chapters.find((c) => c.id === selectedId) ?? null,
    [chapters, selectedId],
  )

  // ---------- 音频加载 ----------
  const loadFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('audio/') && !/\.(mp3|wav|m4a|aac|ogg|flac|opus|webm)$/i.test(file.name)) {
        setLoadError('请选择音频文件')
        return
      }
      setLoading(true)
      setLoadError(null)
      try {
        const buffer = await decodeAudioFile(file)
        const wave = buildWaveform(buffer)
        const url = URL.createObjectURL(file)
        setAudioUrl((old) => {
          if (old) URL.revokeObjectURL(old)
          return url
        })
        setWaveform(wave)
        setDuration(buffer.duration)
        setFileName(file.name)
        setChapters([])
        setSelectedId(null)
        setPreviewId(null)
        setCurrentTime(0)
        setIsPlaying(false)
        // 视口在容器宽度确定后由下面的 effect 适配
        requestAnimationFrame(() =>
          setView({ start: 0, pxPerSecond: Math.max(0.0001, (window.innerWidth - 340) / buffer.duration) }),
        )
      } catch (err) {
        console.error(err)
        setLoadError('音频解码失败，请尝试浏览器支持的格式（MP3 / WAV / M4A / OGG 等）')
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  // ---------- <audio> 事件 ----------
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onTime = () => {
      const t = audio.currentTime
      setCurrentTime(t)
      // 预览片段边界控制
      const pid = previewIdRef.current
      if (pid) {
        const ch = chaptersRef.current.find((c) => c.id === pid)
        if (ch) {
          if (t >= ch.end) {
            if (loopRef.current) {
              audio.currentTime = ch.start
            } else {
              audio.pause()
              setPreviewId(null)
            }
          }
        }
      }
    }
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onEnded = () => {
      setIsPlaying(false)
      setPreviewId(null)
    }
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onEnded)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onEnded)
    }
  }, [audioUrl])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      // 播放到结尾时重新开始
      if (audio.currentTime >= (audio.duration || 0) - 0.05) audio.currentTime = 0
      void audio.play()
    } else {
      audio.pause()
    }
  }, [])

  const seek = useCallback((t: number) => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = Math.max(0, t)
    setCurrentTime(audio.currentTime)
  }, [])

  // ---------- 章节操作 ----------
  const createChapter = useCallback((start: number, end: number) => {
    const sorted = [...chaptersRef.current].sort((a, b) => a.start - b.start)
    const index = sorted.filter((c) => c.start < start).length + 1
    const ch: Chapter = { id: uid(), title: `章节 ${index}`, start, end }
    setChapters((cs) => [...cs, ch])
    setSelectedId(ch.id)
    setPreviewId(null)
  }, [])

  const commitMove = useCallback((id: string, start: number, end: number) => {
    setChapters((cs) => cs.map((c) => (c.id === id ? { ...c, start, end } : c)))
  }, [])

  const commitResize = useCallback((id: string, start: number, end: number) => {
    setChapters((cs) => cs.map((c) => (c.id === id ? { ...c, start, end } : c)))
  }, [])

  const rename = useCallback((id: string, title: string) => {
    setChapters((cs) => cs.map((c) => (c.id === id ? { ...c, title } : c)))
  }, [])

  /** 列表中直接编辑时间：走 resize 约束（防重叠 / 最小时长） */
  const editTime = useCallback((id: string, edge: 'start' | 'end', value: number) => {
    setChapters((cs) => {
      const r = constrainResize(cs, id, edge, value, durationRef.current)
      return cs.map((c) => (c.id === id ? { ...c, start: r.start, end: r.end } : c))
    })
  }, [])

  const durationRef = useRef(duration)
  durationRef.current = duration

  const deleteChapter = useCallback(
    (id: string) => {
      setChapters((cs) => cs.filter((c) => c.id !== id))
      if (selectedId === id) setSelectedId(null)
      if (previewId === id) {
        audioRef.current?.pause()
        setPreviewId(null)
      }
    },
    [selectedId, previewId],
  )

  // ---------- 预览 ----------
  const previewChapter = useCallback(
    (id: string) => {
      const ch = chaptersRef.current.find((c) => c.id === id)
      const audio = audioRef.current
      if (!ch || !audio) return
      setSelectedId(id)
      setPreviewId(id)
      audio.currentTime = ch.start
      void audio.play()
    },
    [],
  )

  const stopPreview = useCallback(() => {
    setPreviewId(null)
    audioRef.current?.pause()
  }, [])

  // ---------- 导出 ----------
  const exportVtt = useCallback(() => {
    if (!fileName || chaptersRef.current.length === 0) return
    downloadFile(`${baseName(fileName)}.vtt`, buildWebVtt(chaptersRef.current), 'text/vtt')
  }, [fileName])

  const exportJson = useCallback(() => {
    if (!fileName || chaptersRef.current.length === 0) return
    downloadFile(
      `${baseName(fileName)}.chapters.json`,
      buildJson(chaptersRef.current, durationRef.current),
      'application/json',
    )
  }, [fileName])

  // ---------- 键盘微调 ----------
  useEffect(() => {
    const isEditable = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false
      const tag = el.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
    }

    const onKey = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return
      const audio = audioRef.current

      if (e.code === 'Space') {
        e.preventDefault()
        togglePlay()
        return
      }

      if (e.key === 'Escape') {
        setSelectedId(null)
        if (previewIdRef.current) stopPreview()
        setShowHelp(false)
        return
      }

      if ((e.key === '?' && e.shiftKey) || e.key === 'F1') {
        e.preventDefault()
        setShowHelp((v) => !v)
        return
      }

      const id = selectedId
      if (!id || !audio) {
        // 无选中时 +/- 仍可缩放
        if (e.key === '+' || e.key === '=') {
          setView((v) =>
            clampView({ ...v, pxPerSecond: Math.min(500, v.pxPerSecond * 1.25) }, durationRef.current, window.innerWidth - 340),
          )
        }
        if (e.key === '-') {
          setView((v) =>
            clampView({ ...v, pxPerSecond: Math.max(0.0001, v.pxPerSecond / 1.25) }, durationRef.current, window.innerWidth - 340),
          )
        }
        return
      }

      const step = e.shiftKey ? 1 : e.altKey ? 0.01 : 0.1
      let handled = true

      switch (e.key) {
        case 'ArrowLeft':
          setChapters((cs) => {
            const r = nudgeChapter(cs, id, -step, 'move', durationRef.current)
            return cs.map((c) => (c.id === id ? { ...c, ...r } : c))
          })
          break
        case 'ArrowRight':
          setChapters((cs) => {
            const r = nudgeChapter(cs, id, step, 'move', durationRef.current)
            return cs.map((c) => (c.id === id ? { ...c, ...r } : c))
          })
          break
        case 'ArrowUp':
          setChapters((cs) => {
            const r = nudgeChapter(cs, id, -step, 'start', durationRef.current)
            return cs.map((c) => (c.id === id ? { ...c, ...r } : c))
          })
          break
        case 'ArrowDown':
          setChapters((cs) => {
            const r = nudgeChapter(cs, id, step, 'end', durationRef.current)
            return cs.map((c) => (c.id === id ? { ...c, ...r } : c))
          })
          break
        case 'Home':
          setChapters((cs) => {
            const r = nudgeChapter(cs, id, -Infinity, 'start', durationRef.current)
            return cs.map((c) => (c.id === id ? { ...c, ...r } : c))
          })
          break
        case 'End':
          setChapters((cs) => {
            const r = nudgeChapter(cs, id, Infinity, 'end', durationRef.current)
            return cs.map((c) => (c.id === id ? { ...c, ...r } : c))
          })
          break
        case 'Delete':
        case 'Backspace':
          deleteChapter(id)
          break
        case 'Enter':
          previewChapter(id)
          break
        case '+':
        case '=':
          setView((v) =>
            clampView({ ...v, pxPerSecond: Math.min(500, v.pxPerSecond * 1.25) }, durationRef.current, window.innerWidth - 340),
          )
          handled = false
          break
        case '-':
          setView((v) =>
            clampView({ ...v, pxPerSecond: Math.max(0.0001, v.pxPerSecond / 1.25) }, durationRef.current, window.innerWidth - 340),
          )
          handled = false
          break
        case '0':
          setView(fitView(durationRef.current, window.innerWidth - 340))
          handled = true
          break
        default:
          handled = false
      }

      if (handled) {
        e.preventDefault()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, togglePlay, deleteChapter, previewChapter, stopPreview])

  // ---------- 拖放导入 ----------
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault()
        setDraggingFile(true)
      }
    }
    const onDragLeave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDraggingFile(false)
    }
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      setDraggingFile(false)
      const f = e.dataTransfer?.files?.[0]
      if (f) void loadFile(f)
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [loadFile])

  const fitAll = useCallback(() => {
    const w = window.innerWidth - 340
    setView(fitView(duration, w))
  }, [duration])

  return (
    <div className="app">
      {audioUrl && (
        <audio ref={audioRef} src={audioUrl} preload="auto" crossOrigin="anonymous" />
      )}

      <Transport
        fileName={fileName}
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        loopPreview={loopPreview}
        onTogglePlay={togglePlay}
        onSeek={seek}
        onOpenFile={(f) => void loadFile(f)}
        onToggleLoop={() => setLoopPreview((v) => !v)}
        onExportVtt={exportVtt}
        onExportJson={exportJson}
        canExport={chapters.length > 0}
      />

      <main className="workspace">
        <section className="main-pane">
          {!waveform ? (
            <div className="empty-state">
              <div className="empty-card">
                <div className="empty-icon">🎙️</div>
                <h1>播客章节标注工作台</h1>
                <p>导入本地音频文件，在可缩放波形上拖拽创建章节区间。</p>
                <label className="btn primary big">
                  选择音频文件
                  <input
                    type="file"
                    accept="audio/*"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) void loadFile(f)
                    }}
                  />
                </label>
                <p className="hint">也可以直接把音频文件拖入窗口</p>
                {loading && <p className="loading">正在解码音频并生成波形…</p>}
                {loadError && <p className="error">{loadError}</p>}
              </div>
            </div>
          ) : (
            <>
              <div className="wave-toolbar">
                <div className="wave-title">
                  波形 · {waveform.channels} 声道 · {waveform.sampleRate / 1000}kHz
                  {selected && (
                    <span className="selected-info">
                      已选：{selected.title || '未命名章节'}（{(selected.end - selected.start).toFixed(2)}s）
                    </span>
                  )}
                </div>
                <div className="wave-toolbar-right">
                  <button type="button" className="btn small ghost" onClick={fitAll}>
                    适应全部 (0)
                  </button>
                  <button
                    type="button"
                    className="btn small ghost"
                    onClick={() => setShowHelp(true)}
                  >
                    快捷键 ?
                  </button>
                </div>
              </div>
              <WaveformView
                waveform={waveform}
                duration={duration}
                chapters={chapters}
                selectedId={selectedId}
                currentTime={currentTime}
                view={view}
                onViewChange={setView}
                onSelect={setSelectedId}
                onSeek={seek}
                onCreate={createChapter}
                onCommitMove={commitMove}
                onCommitResize={commitResize}
              />
              <p className="status-line">
                在空白波形上 <b>拖拽</b> 创建区间 · 拖拽区间中部移动 · 拖拽左右边缘调整 ·
                滚轮缩放 · 标尺拖拽平移 · 区间自动吸附邻近边界且禁止重叠
              </p>
              {loadError && <p className="error">{loadError}</p>}
            </>
          )}
        </section>

        {waveform && (
          <ChapterList
            chapters={chapters}
            duration={duration}
            selectedId={selectedId}
            previewId={previewId}
            isPlaying={isPlaying}
            onSelect={setSelectedId}
            onRename={rename}
            onEditTime={editTime}
            onDelete={deleteChapter}
            onPreview={previewChapter}
            onTogglePreview={togglePlay}
            onStopPreview={stopPreview}
          />
        )}
      </main>

      {draggingFile && (
        <div className="drop-overlay">
          <div className="drop-card">松开以导入音频</div>
        </div>
      )}

      {showHelp && (
        <div className="modal-backdrop" onClick={() => setShowHelp(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>键盘快捷键</h2>
            <table className="help-table">
              <tbody>
                <tr><td>空格</td><td>播放 / 暂停</td></tr>
                <tr><td>← / →</td><td>将选中区间左 / 右微调 0.1s</td></tr>
                <tr><td>↑ / ↓</td><td>微调起点 / 终点 0.1s</td></tr>
                <tr><td>Alt + 方向键</td><td>精确微调 0.01s</td></tr>
                <tr><td>Shift + 方向键</td><td>大步微调 1s</td></tr>
                <tr><td>Home / End</td><td>起点贴到 0 / 终点贴到音频结尾</td></tr>
                <tr><td>Enter</td><td>预览选中章节片段</td></tr>
                <tr><td>Delete / Backspace</td><td>删除选中章节</td></tr>
                <tr><td>+ / − / 0</td><td>放大 / 缩小 / 适应全部</td></tr>
                <tr><td>Esc</td><td>取消选中 / 停止预览</td></tr>
                <tr><td>?</td><td>打开本帮助</td></tr>
              </tbody>
            </table>
            <p className="hint">微调受最小时长（0.25s）和防重叠约束保护，键盘操作不触发吸附。</p>
            <button type="button" className="btn primary" onClick={() => setShowHelp(false)}>
              知道了
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

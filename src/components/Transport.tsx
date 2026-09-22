import { useRef } from 'react'
import { formatTime } from '../utils/time'

export interface TransportProps {
  fileName: string | null
  isPlaying: boolean
  currentTime: number
  duration: number
  loopPreview: boolean
  onTogglePlay: () => void
  onSeek: (t: number) => void
  onOpenFile: (file: File) => void
  onToggleLoop: () => void
  onExportVtt: () => void
  onExportJson: () => void
  canExport: boolean
}

export default function Transport(props: TransportProps) {
  const {
    fileName,
    isPlaying,
    currentTime,
    duration,
    loopPreview,
    onTogglePlay,
    onSeek,
    onOpenFile,
    onToggleLoop,
    onExportVtt,
    onExportJson,
    canExport,
  } = props
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <header className="transport">
      <div className="transport-left">
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onOpenFile(f)
            e.target.value = ''
          }}
        />
        <button type="button" className="btn primary" onClick={() => fileInputRef.current?.click()}>
          导入音频
        </button>
        <span className="file-name" title={fileName ?? ''}>
          {fileName ?? '未加载音频'}
        </span>
      </div>

      <div className="transport-center">
        <button
          type="button"
          className="btn play-btn"
          onClick={onTogglePlay}
          disabled={!fileName}
          title="播放 / 暂停（空格）"
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        <span className="time-readout">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
        <input
          className="seek-bar"
          type="range"
          min={0}
          max={duration || 0}
          step={0.01}
          value={Math.min(currentTime, duration || 0)}
          disabled={!fileName}
          onChange={(e) => onSeek(Number(e.target.value))}
        />
      </div>

      <div className="transport-right">
        <label className="loop-toggle" title="预览章节时循环播放">
          <input type="checkbox" checked={loopPreview} onChange={onToggleLoop} />
          循环预览
        </label>
        <button type="button" className="btn" disabled={!canExport} onClick={onExportVtt}>
          导出 WebVTT
        </button>
        <button type="button" className="btn" disabled={!canExport} onClick={onExportJson}>
          导出 JSON
        </button>
      </div>
    </header>
  )
}

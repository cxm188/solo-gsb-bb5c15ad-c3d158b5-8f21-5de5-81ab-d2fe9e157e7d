/**
 * 使用 Web Audio API 解码音频文件，并降采样为波形峰值数据。
 * peaks 为归一化到 [0, 1] 的每桶峰值（取振幅绝对值最大的采样点）。
 */
export interface WaveformData {
  peaks: Float32Array
  /** 每秒包含多少个峰值桶 */
  bucketsPerSecond: number
  duration: number
  sampleRate: number
  channels: number
}

export async function decodeAudioFile(file: File): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer()
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ctx = new Ctx()
  try {
    return await ctx.decodeAudioData(arrayBuffer.slice(0))
  } finally {
    // 解码完成后即可关闭上下文；播放使用 <audio> 元素
    void ctx.close()
  }
}

export function buildWaveform(buffer: AudioBuffer, bucketCount = 8000): WaveformData {
  const duration = buffer.duration
  const bucketsPerSecond = bucketCount / duration
  const channels = buffer.numberOfChannels
  const peaks = new Float32Array(bucketCount)

  const samplesPerBucket = Math.max(1, Math.floor(buffer.length / bucketCount))

  for (let b = 0; b < bucketCount; b++) {
    const startSample = b * samplesPerBucket
    const endSample = Math.min(buffer.length, startSample + samplesPerBucket)
    let max = 0
    for (let ch = 0; ch < channels; ch++) {
      const data = buffer.getChannelData(ch)
      for (let i = startSample; i < endSample; i++) {
        const v = Math.abs(data[i])
        if (v > max) max = v
      }
    }
    peaks[b] = max
  }

  return {
    peaks,
    bucketsPerSecond,
    duration,
    sampleRate: buffer.sampleRate,
    channels,
  }
}

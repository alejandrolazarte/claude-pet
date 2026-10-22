import type { Mood } from './sessions'

export type Box = { x: number; y: number; width: number; height: number }

// A frame-by-frame export: every top-level group shows itself in turn with its own <animate visibility>.
export function neutralFrameOf(visibility: readonly (string | undefined)[]): number | undefined {
  if (visibility.length < 2 || visibility.some(values => values === undefined)) {
    return undefined
  }
  const shownFirst = visibility.findIndex(values => values?.trim().startsWith('visible'))

  return shownFirst === -1 ? 0 : shownFirst
}

// Seconds each frame stays in each mood, or 'still' to hold the neutral frame. Per frame, not per loop, so a
// 30-frame video cut plays as calmly as Pochita's five frames.
const WORKING_FRAME_SECONDS = 0.1134

const FRAME_SECONDS: Record<Mood, number | 'still'> = {
  idle: 0.48,
  thinking: 'still',
  working: WORKING_FRAME_SECONDS,
  browsing: 0.18,
  asking: 'still',
  happy: 0.08,
  sad: 'still',
  sleeping: 'still',
}

// Pochita's slow idle frames would turn a long video cut into slow motion, so the calm loops stop growing at
// a few seconds, or at a bit slower than working when that is already longer.
const CALM_CAP: Partial<Record<Mood, { seconds: number; ofWorking: number }>> = {
  idle: { seconds: 3, ofWorking: 1.5 },
  browsing: { seconds: 2.5, ofWorking: 1.2 },
}

export function frameLoopSeconds(mood: Mood, frames: number): number | 'still' {
  const seconds = FRAME_SECONDS[mood]
  if (seconds === 'still') {
    return 'still'
  }
  const loop = (perFrame: number) => Math.round(perFrame * frames * 1000) / 1000
  const cap = CALM_CAP[mood]

  return cap ? Math.min(loop(seconds), Math.max(cap.seconds, Math.round(cap.ofWorking * loop(WORKING_FRAME_SECONDS) * 1000) / 1000)) : loop(seconds)
}

// A tap restarts the frames at happy speed: a hop alone would cut a 30-frame video cut halfway.
export function pokeMs(frames: number, hopMs: number): number {
  return Math.max(hopMs, Math.round((FRAME_SECONDS.happy as number) * frames * 1000))
}

export function parseViewBox(text: string | undefined): Box | undefined {
  const numbers = (text ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number)
  if (numbers.length !== 4 || numbers.some(n => !Number.isFinite(n))) {
    return undefined
  }
  const [x = 0, y = 0, width = 0, height = 0] = numbers

  return width > 0 && height > 0 ? { x, y, width, height } : undefined
}

export type Part = { path: number[]; pivot: { x: number; y: number }; swing: number }

export type PartSwing = { values: string; seconds: number; begin: number } | { droop: string }

const MAX_SWING = 45

export function parseParts(json: unknown): Part[] {
  if (!Array.isArray(json)) {
    return []
  }

  return json.flatMap(item => {
    const { path, pivot, swing } = (item ?? {}) as Record<string, unknown>
    if (typeof path !== 'string' || !/^\d+(\.\d+)*$/.test(path) || typeof swing !== 'number' || Math.abs(swing) > MAX_SWING) {
      return []
    }
    const point = typeof pivot === 'string' ? pivot.trim().split(/[\s,]+/).map(Number) : []
    const [x, y] = point
    if (point.length !== 2 || x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) {
      return []
    }

    return [{ path: path.split('.').map(Number), pivot: { x, y }, swing }]
  })
}

// How far (times the part's own swing) and how fast each part wags in each mood: the kitsune's tails.
const WAG: Record<Exclude<Mood, 'sad'>, { scale: number; seconds: number }> = {
  idle: { scale: 1, seconds: 3 },
  thinking: { scale: 0.75, seconds: 2 },
  working: { scale: 2, seconds: 0.6 },
  browsing: { scale: 1.25, seconds: 1.2 },
  asking: { scale: 1.5, seconds: 0.5 },
  happy: { scale: 2.5, seconds: 0.4 },
  sleeping: { scale: 0.375, seconds: 5 },
}

export function partSwing(mood: Mood, { pivot, swing }: Part, index: number): PartSwing {
  const at = `${pivot.x} ${pivot.y}`
  if (mood === 'sad') {
    return { droop: `rotate(${2 * swing} ${at})` }
  }
  const { scale, seconds } = WAG[mood]

  return { values: `0 ${at};${swing * scale} ${at};0 ${at}`, seconds, begin: Math.round(index * 12) / 100 }
}

export type Mood = 'idle' | 'thinking' | 'working' | 'browsing' | 'asking' | 'happy' | 'sad' | 'sleeping'

export type Session = {
  sessionId: string
  repo: string
  mood: Mood | 'gone'
  label: string
  updatedAt: number
  title?: string
}

export type CaptionMode = 'repo' | 'title'

export const STALE_MS = 2 * 60 * 60_000

export type LiveSession = Session & { mood: Mood }

export function visibleSessions(all: readonly Session[], now: number): LiveSession[] {
  return all
    .filter((s): s is LiveSession => s.mood !== 'gone' && now - s.updatedAt <= STALE_MS)
    .sort((a, b) =>
      a.repo.localeCompare(b.repo, undefined, { sensitivity: 'base' }) || a.sessionId.localeCompare(b.sessionId))
}

const PRIORITY: Record<Mood, number> = { asking: 6, working: 5, browsing: 5, thinking: 4, sad: 3, happy: 2, idle: 1, sleeping: 0 }

export function busiest(sessions: readonly LiveSession[]): LiveSession | undefined {
  return sessions.reduce<LiveSession | undefined>(
    (best, s) =>
      best === undefined ||
      PRIORITY[s.mood] > PRIORITY[best.mood] ||
      (PRIORITY[s.mood] === PRIORITY[best.mood] && s.updatedAt > best.updatedAt)
        ? s
        : best,
    undefined,
  )
}

// Claude thinks for a moment between two tools: showing it would restart the animation on every tool.
export function moodDelayMs(shown: Mood, next: Mood): number {
  return next === 'thinking' && (shown === 'working' || shown === 'browsing') ? 2000 : 0
}

export function captionOf(session: Session, mode: CaptionMode): string {
  return mode === 'title' && session.title?.trim() ? session.title : session.repo
}

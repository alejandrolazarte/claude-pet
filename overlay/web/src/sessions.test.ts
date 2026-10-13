import { describe, expect, it } from 'vitest'

import { busiest, captionOf, moodDelayMs, STALE_MS, visibleSessions, type Session } from './sessions'

const NOW = 10 * STALE_MS

const session = (overrides: Partial<Session>): Session => ({
  sessionId: 'a',
  repo: 'my-project',
  mood: 'idle',
  label: 'esperando',
  updatedAt: NOW,
  ...overrides,
})

describe('visibleSessions', () => {
  it('hides sessions that ended', () => {
    // Arrange
    const all = [session({ sessionId: 'open' }), session({ sessionId: 'closed', mood: 'gone' })]

    // Act
    const visible = visibleSessions(all, NOW)

    // Assert
    expect(visible.map(s => s.sessionId)).toEqual(['open'])
  })

  it('hides sessions silent for longer than STALE_MS, keeps one right at the limit', () => {
    // Arrange
    const all = [
      session({ sessionId: 'limit', updatedAt: NOW - STALE_MS }),
      session({ sessionId: 'stale', updatedAt: NOW - STALE_MS - 1 }),
    ]

    // Act
    const visible = visibleSessions(all, NOW)

    // Assert
    expect(visible.map(s => s.sessionId)).toEqual(['limit'])
  })

  it('orders by repo, then by session id, so pets do not jump around', () => {
    // Arrange
    const all = [
      session({ sessionId: 'z', repo: 'Accounts' }),
      session({ sessionId: 'b', repo: 'my-project' }),
      session({ sessionId: 'a', repo: 'my-project' }),
    ]

    // Act
    const visible = visibleSessions(all, NOW)

    // Assert
    expect(visible.map(s => s.sessionId)).toEqual(['z', 'a', 'b'])
  })
})

describe('busiest', () => {
  it('picks the session doing the most: working beats thinking beats the rest', () => {
    // Arrange
    const all = visibleSessions(
      [
        session({ sessionId: 'idle', mood: 'idle' }),
        session({ sessionId: 'working', mood: 'working' }),
        session({ sessionId: 'thinking', mood: 'thinking' }),
        session({ sessionId: 'sleeping', mood: 'sleeping' }),
      ],
      NOW,
    )

    // Act
    const shown = busiest(all)

    // Assert
    expect(shown?.sessionId).toBe('working')
  })

  it('a session waiting for you beats every other, even one that is working', () => {
    // Arrange
    const all = visibleSessions(
      [
        session({ sessionId: 'a-working', mood: 'working', updatedAt: NOW }),
        session({ sessionId: 'b-asking', mood: 'asking', updatedAt: NOW - 10 }),
      ],
      NOW,
    )

    // Act
    const shown = busiest(all)

    // Assert
    expect(shown?.sessionId).toBe('b-asking')
  })

  it('browsing a page is as busy as working, and beats thinking', () => {
    // Arrange
    const all = visibleSessions(
      [
        session({ sessionId: 'a-thinking', mood: 'thinking', updatedAt: NOW }),
        session({ sessionId: 'b-browsing', mood: 'browsing', updatedAt: NOW - 10 }),
      ],
      NOW,
    )

    // Act
    const shown = busiest(all)

    // Assert
    expect(shown?.sessionId).toBe('b-browsing')
  })

  it('a finished turn (happy or sad) beats waiting and sleeping', () => {
    // Arrange
    const all = visibleSessions(
      [session({ sessionId: 'idle', mood: 'idle' }), session({ sessionId: 'sad', mood: 'sad' })],
      NOW,
    )

    // Act
    const shown = busiest(all)

    // Assert
    expect(shown?.sessionId).toBe('sad')
  })

  it('between equally busy sessions, shows the one that changed last', () => {
    // Arrange
    const all = visibleSessions(
      [
        session({ sessionId: 'older', mood: 'working', updatedAt: NOW - 10 }),
        session({ sessionId: 'newer', mood: 'working', updatedAt: NOW }),
      ],
      NOW,
    )

    // Act
    const shown = busiest(all)

    // Assert
    expect(shown?.sessionId).toBe('newer')
  })

  it('is undefined when there are no sessions', () => {
    // Act
    const shown = busiest([])

    // Assert
    expect(shown).toBeUndefined()
  })
})

describe('captionOf', () => {
  it('shows the project, or the session title when asked for it', () => {
    // Arrange
    const titled = session({ repo: 'my-project', title: 'Qué es esto' })

    // Act
    const asProject = captionOf(titled, 'repo')
    const asTitle = captionOf(titled, 'title')

    // Assert
    expect(asProject).toBe('my-project')
    expect(asTitle).toBe('Qué es esto')
  })

  it('falls back to the project when the session has no title yet', () => {
    // Act
    const untitled = captionOf(session({ repo: 'my-project' }), 'title')
    const blank = captionOf(session({ repo: 'my-project', title: '  ' }), 'title')

    // Assert
    expect(untitled).toBe('my-project')
    expect(blank).toBe('my-project')
  })
})

describe('moodDelayMs', () => {
  it('waits before showing thinking between two tools, so the animation does not restart on every tool', () => {
    // Act
    const afterWorking = moodDelayMs('working', 'thinking')
    const afterBrowsing = moodDelayMs('browsing', 'thinking')

    // Assert
    expect(afterWorking).toBe(2000)
    expect(afterBrowsing).toBe(2000)
  })

  it('shows any other change at once', () => {
    // Act
    const delays = [
      moodDelayMs('thinking', 'working'),
      moodDelayMs('working', 'asking'),
      moodDelayMs('working', 'sad'),
      moodDelayMs('working', 'happy'),
      moodDelayMs('idle', 'thinking'),
      moodDelayMs('working', 'browsing'),
    ]

    // Assert
    expect(delays).toEqual([0, 0, 0, 0, 0, 0])
  })
})

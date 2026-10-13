import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { onHostMessage, send } from './bridge'
import { availableCharacters, resolveCharacter, scaleOf } from './characters'
import { Pet, type Art } from './Pet'
import { genericArt } from './Generic'
import { busiest, captionOf, finishedTask, moodDelayMs, visibleSessions, type CaptionMode, type Mood, type Session } from './sessions'

export function App() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [now, setNow] = useState(() => Date.now())
  const [isHovered, setIsHovered] = useState(false)
  const [savedCharacter, setSavedCharacter] = useState<string>()
  const [art, setArt] = useState<Art>({ custom: new Map() })
  const [customCharacters, setCustomCharacters] = useState<{ id: string; label: string }[]>([])
  const [caption, setCaption] = useState<CaptionMode>('repo')
  const [sizes, setSizes] = useState<Record<string, unknown> | null>(null)
  const pets = useRef<HTMLDivElement>(null)
  const moods = useRef<Record<string, Session['mood']>>({})

  useEffect(() => {
    const stop = onHostMessage(message => {
      if (message.type === 'sessions') {
        setSessions(message.sessions)
        setNow(Date.now())
      } else if (message.type === 'mouseleave') {
        setIsHovered(false)
      } else if (message.type === 'character') {
        setSavedCharacter(message.id ?? undefined)
      } else if (message.type === 'caption') {
        setCaption(message.mode === 'title' ? 'title' : 'repo')
      } else if (message.type === 'sizes') {
        setSizes(message.sizes)
      } else if (message.type === 'art') {
        setArt({ custom: new Map(message.characters.map(c => [c.id, genericArt(c.svg, c.viewBox ?? undefined, c.parts, c.outline === true)])) })
        setCustomCharacters(message.characters.map(({ id, label }) => ({ id, label })))
      }
    })
    send({ type: 'ready' })

    return stop
  }, [])

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 60_000)

    return () => clearInterval(tick)
  }, [])

  useLayoutEffect(() => {
    const element = pets.current
    if (!element) {
      return
    }
    const observer = new ResizeObserver(() =>
      send({ type: 'size', width: Math.ceil(element.scrollWidth), height: Math.ceil(element.scrollHeight) }),
    )
    observer.observe(element)

    return () => observer.disconnect()
  }, [])

  const visible = visibleSessions(sessions, now)
  const shown = busiest(visible)
  const available = availableCharacters({ custom: customCharacters })
  const character = resolveCharacter(savedCharacter, available)
  const scale = scaleOf(sizes, character)
  const liveMood: Mood = shown?.mood ?? 'sleeping'
  const [mood, setMood] = useState<Mood>(liveMood)

  useEffect(() => {
    if (liveMood === mood) {
      return
    }
    const timer = setTimeout(() => setMood(liveMood), moodDelayMs(mood, liveMood))

    return () => clearTimeout(timer)
  }, [liveMood, mood])

  useEffect(() => {
    if (finishedTask(moods.current, sessions)) {
      send({ type: 'done', character })
    }
    moods.current = Object.fromEntries(sessions.map(s => [s.sessionId, s.mood]))
  }, [sessions])

  return (
    <div
      ref={pets}
      className="pets"
      onMouseDown={event => event.button === 0 && send({ type: 'drag' })}
      onContextMenu={event => {
        event.preventDefault()
        send({ type: 'menu', characters: available, current: character, caption })
      }}
    >
      {shown === undefined ? (
        <Pet art={art} character={character} scale={scale} mood={mood} label="sin sesiones" />
      ) : (
        <Pet
          art={art}
          character={character}
          scale={scale}
          mood={mood}
          label={shown.label}
          heading={captionOf(shown, caption)}
          others={visible.length - 1}
          onOthersHover={setIsHovered}
        />
      )}
      {isHovered && visible.length > 0 && (
        <ul className="sessions">
          {visible.map(session => (
            <li key={session.sessionId}>
              <span className="repo">{captionOf(session, caption)}</span>
              <span className="label">{session.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

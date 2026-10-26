import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { onHostMessage, send } from './bridge'
import { availableCharacters, resolveCharacter, scaleOf } from './characters'
import { Pet, type Art } from './Pet'
import { genericArt } from './Generic'
import { questionsAfter, type Question } from './permissions'
import { movedBeyond, type Point } from './pointer'
import { StepsBubble } from './StepsBubble'
import { pokeMs } from './svgLayout'
import { busiest, captionOf, finishedTask, moodDelayMs, visibleSessions, type CaptionMode, type Mood, type Session } from './sessions'

const DRAG_PX = 4
// As long as the hop in Pet.tsx and Generic.tsx.
const POKE_MS = 1200

export function App() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [now, setNow] = useState(() => Date.now())
  const [isHovered, setIsHovered] = useState(false)
  const [savedCharacter, setSavedCharacter] = useState<string>()
  const [art, setArt] = useState<Art>({ custom: new Map() })
  const [customCharacters, setCustomCharacters] = useState<{ id: string; label: string }[]>([])
  const [caption, setCaption] = useState<CaptionMode>('repo')
  const [areStepsOn, setAreStepsOn] = useState(true)
  const [sizes, setSizes] = useState<Record<string, unknown> | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const pets = useRef<HTMLDivElement>(null)
  const moods = useRef<Record<string, Session['mood']>>({})
  // Where the left button went down, until it moves far enough to be a drag.
  const press = useRef<Point | null>(null)
  // Each tap gets a new id, so tapping again restarts the reaction.
  const [poke, setPoke] = useState<number>()

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
      } else if (message.type === 'steps') {
        setAreStepsOn(message.isOn)
      } else if (message.type === 'sizes') {
        setSizes(message.sizes)
      } else if (message.type === 'art') {
        setArt({ custom: new Map(message.characters.map(c => [c.id, genericArt(c.svg, c.viewBox ?? undefined, c.parts, c.outline === true)])) })
        setCustomCharacters(message.characters.map(({ id, label }) => ({ id, label })))
      } else if (message.type === 'permission' || message.type === 'permission-done') {
        setQuestions(current => questionsAfter(current, message))
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
  const pokeDuration = pokeMs(art.custom.get(character)?.frames ?? 0, POKE_MS)
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

  useEffect(() => {
    if (poke === undefined) {
      return
    }
    const timer = setTimeout(() => setPoke(undefined), pokeDuration)

    return () => clearTimeout(timer)
  }, [poke, pokeDuration])

  return (
    <div
      ref={pets}
      className="pets"
      onMouseDown={event => {
        if (event.button === 0) {
          press.current = { x: event.screenX, y: event.screenY }
        }
      }}
      onMouseMove={event => {
        // A release outside the window never reaches the page: no button held means that press is over.
        if (press.current && (event.buttons & 1) === 0) {
          press.current = null
        }
        if (press.current && movedBeyond(press.current, { x: event.screenX, y: event.screenY }, DRAG_PX)) {
          press.current = null
          send({ type: 'drag' })
        }
      }}
      onMouseUp={event => {
        if (event.button === 0 && press.current) {
          press.current = null
          setPoke(Date.now())
          send({ type: 'poke', character })
        }
      }}
      onContextMenu={event => {
        event.preventDefault()
        send({ type: 'menu', characters: available, current: character, caption })
      }}
    >
      {questions[0] && (
        // Stopped here: a press on the bubble must not start a drag or count as a tap on the pet.
        <div className="permission-bubble" onMouseDown={event => event.stopPropagation()} onMouseUp={event => event.stopPropagation()}>
          <span>{questions[0].description}</span>
          <div>
            <button onClick={() => send({ type: 'permission-answer', requestId: questions[0]!.requestId, decision: 'allow' })}>Permitir</button>
            <button onClick={() => send({ type: 'permission-answer', requestId: questions[0]!.requestId, decision: 'deny' })}>Denegar</button>
          </div>
        </div>
      )}
      {shown === undefined ? (
        <Pet art={art} character={character} scale={scale} mood={mood} poke={poke} label="sin sesiones" />
      ) : (
        <Pet
          art={art}
          character={character}
          scale={scale}
          mood={mood}
          poke={poke}
          label={shown.label}
          heading={captionOf(shown, caption)}
          others={visible.length - 1}
          onOthersHover={setIsHovered}
          bubble={areStepsOn && shown.steps?.length ? <StepsBubble heading={captionOf(shown, caption)} steps={shown.steps} /> : undefined}
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

import { Fragment, useEffect, useReducer, useRef, useState } from 'react'

import type { Mood } from '../sessions'
import { onChatHostMessage, sendChat } from './chatBridge'
import { chatReducer, initialChat } from './chatReducer'
import alertIcon from './icons/alert.svg'
import clockIcon from './icons/clock.svg'
import deniedIcon from './icons/denied.svg'
import doneIcon from './icons/done.svg'
import plusIcon from './icons/plus.svg'
import runningIcon from './icons/running.svg'
import sendIcon from './icons/send.svg'
import stopIcon from './icons/stop.svg'
import typingIcon from './icons/typing.svg'
import { CELEBRATE_MS, IDLE_MOOD, moodOfLine, SENT_MOOD, type PetMood } from './petMood'
import { blocksOf, countdown, initials } from './present'
import type { Answer, ChatItem, Decision, Diff, DiffLine, ToolItem, ToolStatus } from './types'

const ANSWER_TEXT: Record<Answer, string> = {
  allow: 'Permitido',
  'allow-session-edits': 'Permitido, con las ediciones de esta charla',
  deny: 'Denegado',
  cancelled: 'Cancelado',
}

const STEP_ICON: Record<ToolStatus, string> = { running: runningIcon, done: doneIcon, error: deniedIcon }

const STEP_TEXT: Record<ToolStatus, string> = { running: 'en curso', done: 'hecho', error: 'falló' }

const TONE: Record<Mood, string> = {
  idle: 'tone-quiet',
  sleeping: 'tone-quiet',
  sad: 'tone-quiet',
  thinking: 'tone-busy',
  working: 'tone-busy',
  browsing: 'tone-busy',
  asking: 'tone-alert',
  happy: 'tone-done',
}

const MARK: Record<DiffLine['kind'], string> = { same: ' ', del: '−', add: '+' }

const ASK_TEXT: Record<string, string> = { Bash: 'ejecutar un comando', Edit: 'editar un archivo', Write: 'escribir un archivo' }

type Permission = Extract<ChatItem, { kind: 'permission' }>

function DiffBlock({ diff }: { diff: Diff }) {
  return (
    <div className="diff">
      <div className="diff-file">
        <span>{diff.file}</span>
        <span className="diff-counts">
          +{diff.added}  −{diff.removed}
        </span>
      </div>
      {diff.lines.map((line, index) => (
        <div key={index} className={`diff-line ${line.kind}`}>
          <span className="mark">{MARK[line.kind]}</span>
          <span>{line.text}</span>
        </div>
      ))}
      {diff.hidden > 0 && <div className="diff-more">… {diff.hidden} líneas más</div>}
    </div>
  )
}

function Steps({ tools, asking }: { tools: ToolItem[]; asking: Set<string> }) {
  return (
    <div className="steps">
      <div className="steps-title">
        Pasos <span>{tools.length}</span>
      </div>
      {tools.map(tool => (
        <Fragment key={tool.id}>
          <div className={`step ${tool.status}`}>
            <img src={STEP_ICON[tool.status]} width={16} height={16} alt={STEP_TEXT[tool.status]} />
            <b>{tool.name}</b>
            {tool.summary !== tool.name && <code>{tool.summary}</code>}
            {tool.diff && (
              <>
                <span className="added">+{tool.diff.added}</span>
                <span className="removed">−{tool.diff.removed}</span>
              </>
            )}
          </div>
          {/* A pending permission card already shows this diff; a failed change never landed. */}
          {tool.diff && tool.status !== 'error' && !asking.has(tool.id) && <DiffBlock diff={tool.diff} />}
        </Fragment>
      ))}
    </div>
  )
}

function PermissionCard({
  item,
  label,
  now,
  onAnswer,
}: {
  item: Permission
  label: string
  now: number
  onAnswer: (requestId: string, decision: Decision) => void
}) {
  const wants = ASK_TEXT[item.tool] ?? `usar ${item.tool}`
  if (item.answer) {
    return (
      <div className="permission answered">
        {label} quiso {wants}: <b>{ANSWER_TEXT[item.answer]}</b>
      </div>
    )
  }

  return (
    <div className="permission">
      <div className="permission-title">
        <img src={alertIcon} width={18} height={18} alt="" />
        {label} quiere {wants}
      </div>
      {item.diff ? <DiffBlock diff={item.diff} /> : <pre>{item.detail}</pre>}
      <div className="buttons">
        <button className="primary" onClick={() => onAnswer(item.requestId, 'allow')}>
          Permitir
        </button>
        {item.canAllowEdits && (
          <button className="secondary" onClick={() => onAnswer(item.requestId, 'allow-session-edits')}>
            Siempre en esta charla
          </button>
        )}
        <button className="danger" onClick={() => onAnswer(item.requestId, 'deny')}>
          Denegar
        </button>
      </div>
      <div className="expires">
        <img src={clockIcon} width={12} height={12} alt="" />
        Si no contestás, se deniega en {countdown(item.askedAt, now)}
      </div>
    </div>
  )
}

function Item({
  item,
  label,
  now,
  onAnswer,
}: {
  item: Exclude<ChatItem, ToolItem>
  label: string
  now: number
  onAnswer: (requestId: string, decision: Decision) => void
}) {
  switch (item.kind) {
    case 'user':
      return <div className="bubble user">{item.text}</div>
    case 'assistant':
      return (
        <div className="bubble character">
          <span className="name">{label}</span>
          {item.text}
        </div>
      )
    case 'notice':
      return <p className="notice">{item.text}</p>
    case 'permission':
      return <PermissionCard item={item} label={label} now={now} onAnswer={onAnswer} />
  }
}

export function ChatApp() {
  const [state, dispatch] = useReducer(chatReducer, initialChat)
  const [header, setHeader] = useState<{ label: string }>()
  const [error, setError] = useState<string | null>(null)
  const [exited, setExited] = useState(false)
  const [draftText, setDraftText] = useState('')
  const [mood, setMood] = useState<PetMood>(IDLE_MOOD)
  const [now, setNow] = useState(Date.now)
  const celebrate = useRef<ReturnType<typeof setTimeout>>(undefined)
  const bottom = useRef<HTMLDivElement>(null)

  const reportMood = (next: PetMood) => {
    clearTimeout(celebrate.current)
    setMood(next)
    sendChat({ type: 'chat-mood', ...next })
    if (next.mood === 'happy') {
      celebrate.current = setTimeout(() => reportMood(IDLE_MOOD), CELEBRATE_MS)
    }
  }

  useEffect(() => {
    const stop = onChatHostMessage(message => {
      switch (message.type) {
        case 'chat-init':
          setHeader({ label: message.label })
          setError(message.error)
          setExited(false)
          dispatch({ type: 'reset', items: message.notice ? [...message.history, { kind: 'notice', text: message.notice }] : message.history })
          reportMood(IDLE_MOOD)
          break
        case 'chat-event': {
          dispatch({ type: 'line', line: message.line, at: Date.now() })
          const next = moodOfLine(message.line)
          if (next) {
            reportMood(next)
          }
          break
        }
        case 'chat-permission-done':
          dispatch({ type: 'answered', requestId: message.requestId, decision: message.decision })
          reportMood(SENT_MOOD)
          break
        case 'chat-exit':
          setExited(true)
          dispatch({ type: 'exit', code: message.code })
          break
      }
    })
    sendChat({ type: 'chat-ready' })

    return () => {
      stop()
      clearTimeout(celebrate.current)
    }
  }, [])

  // Braces matter: scrollIntoView returns a Promise in current WebView2, and React would call it as the cleanup.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [state.items, state.draft])

  const asking = new Set(state.items.flatMap(item => (item.kind === 'permission' && !item.answer ? [item.toolUseId] : [])))
  const waiting = asking.size > 0
  useEffect(() => {
    if (!waiting) {
      return
    }
    setNow(Date.now())
    const tick = setInterval(() => setNow(Date.now()), 1000)

    return () => clearInterval(tick)
  }, [waiting])

  const closed = Boolean(error) || exited
  const submit = () => {
    const message = draftText.trim()
    if (!message || state.busy || closed) {
      return
    }
    dispatch({ type: 'sent', text: message })
    sendChat({ type: 'chat-send', text: message })
    reportMood(SENT_MOOD)
    setDraftText('')
  }
  const answer = (requestId: string, decision: Decision) => sendChat({ type: 'chat-permission', requestId, decision })
  const label = header?.label ?? ''
  const typing = state.busy && !state.draft && !waiting && !state.items.some(item => item.kind === 'tool' && item.status === 'running')

  return (
    <div className="chat">
      <header className={TONE[mood.mood]}>
        <div className="avatar" aria-hidden="true">
          {initials(label)}
        </div>
        <div className="who">
          <strong>{label || '…'}</strong>
          <span className="status">{mood.label}</span>
        </div>
        <button
          className="icon"
          title="Nueva conversación"
          aria-label="Nueva conversación"
          onClick={() => sendChat({ type: 'chat-new' })}
          disabled={!header || Boolean(error)}
        >
          <img src={plusIcon} width={16} height={16} alt="" />
        </button>
      </header>
      <main>
        {error && <p className="error">{error}</p>}
        {blocksOf(state.items).map((block, index) =>
          block.kind === 'steps' ? (
            <Steps key={index} tools={block.tools} asking={asking} />
          ) : (
            <Item key={index} item={block.item} label={label} now={now} onAnswer={answer} />
          ),
        )}
        {state.draft && (
          <div className="bubble character">
            <span className="name">{label}</span>
            {state.draft}
          </div>
        )}
        {typing && <img className="typing" src={typingIcon} width={69} height={41} alt={`${label} está escribiendo`} />}
        {exited && (
          <button className="secondary resume" onClick={() => sendChat({ type: 'chat-resume' })}>
            Reanudar
          </button>
        )}
        <div ref={bottom} />
      </main>
      <footer>
        <div className="composer">
          <textarea
            rows={1}
            value={draftText}
            placeholder={`Escribile a ${label || 'tu personaje'}…`}
            disabled={closed}
            onChange={event => setDraftText(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                submit()
              }
            }}
          />
          {state.busy ? (
            <button className="round" title="Detener" aria-label="Detener" onClick={() => sendChat({ type: 'chat-interrupt' })}>
              <img src={stopIcon} width={14} height={14} alt="" />
            </button>
          ) : (
            <button className="round" title="Enviar" aria-label="Enviar" onClick={submit} disabled={!draftText.trim() || closed}>
              <img src={sendIcon} width={14} height={14} alt="" />
            </button>
          )}
        </div>
      </footer>
    </div>
  )
}

import { useEffect, useReducer, useRef, useState } from 'react'

import { onChatHostMessage, sendChat } from './chatBridge'
import { chatReducer, initialChat } from './chatReducer'
import { CELEBRATE_MS, IDLE_MOOD, moodOfLine, SENT_MOOD, type PetMood } from './petMood'
import type { ChatItem, Decision } from './types'

const ANSWER_TEXT: Record<Decision, string> = {
  allow: 'Permitido',
  'allow-session-edits': 'Permitido, con las ediciones de esta charla',
  deny: 'Denegado',
}

function Item({ item, label, onAnswer }: { item: ChatItem; label: string; onAnswer: (requestId: string, decision: Decision) => void }) {
  switch (item.kind) {
    case 'user':
      return <p className="user">{item.text}</p>
    case 'assistant':
      return (
        <p className="assistant">
          <b>{label}:</b> {item.text}
        </p>
      )
    case 'tool':
      return (
        <p className="tool">
          [{item.name}] {item.summary}
        </p>
      )
    case 'notice':
      return <p className="notice">{item.text}</p>
    case 'permission':
      return (
        <div className="permission">
          <div>
            {label} quiere usar <b>{item.tool}</b>:
          </div>
          <pre>{item.detail}</pre>
          {item.answer ? (
            <div className="answer">{ANSWER_TEXT[item.answer]}</div>
          ) : (
            <div className="buttons">
              <button onClick={() => onAnswer(item.requestId, 'allow')}>Permitir</button>
              {item.canAllowEdits && (
                <button onClick={() => onAnswer(item.requestId, 'allow-session-edits')}>Permitir ediciones en esta charla</button>
              )}
              <button onClick={() => onAnswer(item.requestId, 'deny')}>Denegar</button>
            </div>
          )}
        </div>
      )
  }
}

export function ChatApp() {
  const [state, dispatch] = useReducer(chatReducer, initialChat)
  const [header, setHeader] = useState<{ label: string; folder: string }>()
  const [error, setError] = useState<string | null>(null)
  const [exited, setExited] = useState(false)
  const [draftText, setDraftText] = useState('')
  const celebrate = useRef<ReturnType<typeof setTimeout>>(undefined)
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const reportMood = (mood: PetMood) => {
      clearTimeout(celebrate.current)
      sendChat({ type: 'chat-mood', ...mood })
      if (mood.mood === 'happy') {
        celebrate.current = setTimeout(() => sendChat({ type: 'chat-mood', ...IDLE_MOOD }), CELEBRATE_MS)
      }
    }
    const stop = onChatHostMessage(message => {
      switch (message.type) {
        case 'chat-init':
          setHeader({ label: message.label, folder: message.folder })
          setError(message.error)
          setExited(false)
          dispatch({ type: 'reset', items: message.notice ? [...message.history, { kind: 'notice', text: message.notice }] : message.history })
          reportMood(IDLE_MOOD)
          break
        case 'chat-event': {
          dispatch({ type: 'line', line: message.line })
          const mood = moodOfLine(message.line)
          if (mood) {
            reportMood(mood)
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

  useEffect(() => bottom.current?.scrollIntoView({ block: 'end' }), [state.items, state.draft])

  const closed = Boolean(error) || exited
  const submit = () => {
    const message = draftText.trim()
    if (!message || state.busy || closed) {
      return
    }
    dispatch({ type: 'sent', text: message })
    sendChat({ type: 'chat-send', text: message })
    // A pending "listo → esperando" would otherwise overwrite "pensando".
    clearTimeout(celebrate.current)
    sendChat({ type: 'chat-mood', ...SENT_MOOD })
    setDraftText('')
  }
  const answer = (requestId: string, decision: Decision) => sendChat({ type: 'chat-permission', requestId, decision })
  const label = header?.label ?? ''

  return (
    <div className="chat">
      <header>
        <strong>{label || '…'}</strong>
        <span className="folder">{header?.folder}</span>
        <button onClick={() => sendChat({ type: 'chat-new' })} disabled={!header || Boolean(error)}>
          Nueva conversación
        </button>
      </header>
      <main>
        {error && <p className="error">{error}</p>}
        {state.items.map((item, index) => (
          <Item key={index} item={item} label={label} onAnswer={answer} />
        ))}
        {state.draft && (
          <p className="assistant">
            <b>{label}:</b> {state.draft}
          </p>
        )}
        {exited && (
          <button className="resume" onClick={() => sendChat({ type: 'chat-resume' })}>
            Reanudar
          </button>
        )}
        <div ref={bottom} />
      </main>
      <footer>
        <textarea
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
          <button onClick={() => sendChat({ type: 'chat-interrupt' })}>Detener</button>
        ) : (
          <button onClick={submit} disabled={!draftText.trim() || closed}>
            Enviar
          </button>
        )}
      </footer>
    </div>
  )
}

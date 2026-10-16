import { isJson, parseLine, text, type Json } from './json'
import type { ChatItem, ChatState, Decision } from './types'

export type ChatAction =
  | { type: 'line'; line: string }
  | { type: 'sent'; text: string }
  | { type: 'answered'; requestId: string; decision: Decision }
  | { type: 'reset'; items: ChatItem[] }
  | { type: 'exit'; code: number }

export const initialChat: ChatState = { items: [], draft: '', busy: false }

const fileName = (path: string) => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path

const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max)}…` : value)

export function toolSummary(name: string, input: Json): string {
  if (typeof input.command === 'string') {
    return `$ ${clip(input.command, 120)}`
  }
  const path = input.file_path ?? input.notebook_path ?? input.path
  if (typeof path === 'string') {
    return fileName(path)
  }
  if (typeof input.pattern === 'string') {
    return input.pattern
  }

  return typeof input.url === 'string' ? input.url : name
}

export function permissionDetail(name: string, input: Json, description: string): string {
  if (typeof input.command === 'string') {
    return `$ ${input.command}`
  }
  if (name === 'Edit' && typeof input.file_path === 'string') {
    return `${input.file_path}\n- ${clip(text(input.old_string), 600)}\n+ ${clip(text(input.new_string), 600)}`
  }
  if (name === 'Write' && typeof input.file_path === 'string') {
    return `${input.file_path}\n${clip(text(input.content), 600)}`
  }

  return description
}

// Text still streaming becomes a message of its own when something else interrupts it.
function flush(state: ChatState): ChatState {
  return state.draft ? { ...state, items: [...state.items, { kind: 'assistant', text: state.draft }], draft: '' } : state
}

function onLine(state: ChatState, line: string): ChatState {
  const event = parseLine(line)
  if (!event) {
    console.warn('chat: ignoring a line that is not a JSON object', line.slice(0, 200))

    return state
  }

  switch (event.type) {
    case 'system':
      return event.subtype === 'init' && typeof event.session_id === 'string' ? { ...state, sessionId: event.session_id } : state
    case 'stream_event': {
      const inner = isJson(event.event) ? event.event : {}
      const delta = isJson(inner.delta) ? inner.delta : {}

      return inner.type === 'content_block_delta' && delta.type === 'text_delta' ? { ...state, draft: state.draft + text(delta.text) } : state
    }
    case 'assistant': {
      const message = isJson(event.message) ? event.message : {}
      const blocks = Array.isArray(message.content) ? message.content.filter(isJson) : []
      let next = state
      for (const block of blocks) {
        if (block.type === 'text' && text(block.text).trim()) {
          next = { ...next, items: [...next.items, { kind: 'assistant', text: text(block.text) }], draft: '' }
        } else if (block.type === 'tool_use') {
          const name = text(block.name)
          const summary = toolSummary(name, isJson(block.input) ? block.input : {})
          const flushed = flush(next)
          next = { ...flushed, items: [...flushed.items, { kind: 'tool', id: text(block.id), name, summary }] }
        }
      }

      return next
    }
    case 'control_request': {
      const request = isJson(event.request) ? event.request : {}
      if (request.subtype !== 'can_use_tool' || typeof event.request_id !== 'string') {
        return state
      }
      const tool = text(request.tool_name)
      const input = isJson(request.input) ? request.input : {}
      const suggestions = Array.isArray(request.permission_suggestions) ? request.permission_suggestions.filter(isJson) : []
      const card: ChatItem = {
        kind: 'permission',
        requestId: event.request_id,
        tool,
        detail: permissionDetail(tool, input, text(request.description) || tool),
        canAllowEdits: suggestions.some(suggestion => suggestion.type === 'setMode' && suggestion.mode === 'acceptEdits'),
      }
      const flushed = flush(state)

      return { ...flushed, items: [...flushed.items, card] }
    }
    case 'result': {
      const flushed = flush(state)
      const notice: ChatItem[] = event.subtype === 'success' ? [] : [{ kind: 'notice', text: 'Se detuvo antes de terminar.' }]

      return { ...flushed, busy: false, items: [...flushed.items, ...notice] }
    }
    default:
      return state
  }
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'sent':
      return { ...state, items: [...state.items, { kind: 'user', text: action.text }], busy: true }
    case 'answered':
      return {
        ...state,
        items: state.items.map(item =>
          item.kind === 'permission' && item.requestId === action.requestId ? { ...item, answer: action.decision } : item,
        ),
      }
    case 'reset':
      return { ...initialChat, items: action.items }
    case 'exit': {
      const flushed = flush(state)

      return { ...flushed, busy: false, items: [...flushed.items, { kind: 'notice', text: `La sesión terminó (código ${action.code}).` }] }
    }
    case 'line':
      return onLine(state, action.line)
  }
}

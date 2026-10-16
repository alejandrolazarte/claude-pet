import { isJson, parseLine, text, type Json } from './json'
import type { ChatItem, ChatState, Decision, Diff, DiffLine, ToolStatus } from './types'

export type ChatAction =
  // `at` is when the line arrived: a permission card counts its timeout from it.
  | { type: 'line'; line: string; at: number }
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
  const summary = toolSummary(name, input)

  return summary !== name ? summary : description
}

const MAX_DIFF_LINES = 12

const linesOf = (value: string) => (value ? value.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n') : [])

// Lines both sides share at the start and at the end are context; whatever is left between them changed.
function changeLines(before: string[], after: string[]): DiffLine[] {
  let start = 0
  while (start < before.length && start < after.length && before[start] === after[start]) {
    start++
  }
  let end = 0
  while (end < before.length - start && end < after.length - start && before.at(-1 - end) === after.at(-1 - end)) {
    end++
  }
  const as = (kind: DiffLine['kind']) => (line: string): DiffLine => ({ kind, text: line })

  return [
    ...before.slice(0, start).map(as('same')),
    ...before.slice(start, before.length - end).map(as('del')),
    ...after.slice(start, after.length - end).map(as('add')),
    ...before.slice(before.length - end).map(as('same')),
  ]
}

export function diffOf(name: string, input: Json): Diff | undefined {
  if (typeof input.file_path !== 'string') {
    return undefined
  }
  let lines: DiffLine[]
  if (name === 'Edit') {
    lines = changeLines(linesOf(text(input.old_string)), linesOf(text(input.new_string)))
  } else if (name === 'Write') {
    lines = linesOf(text(input.content)).map(line => ({ kind: 'add', text: line }))
  } else {
    return undefined
  }

  return {
    file: fileName(input.file_path),
    added: lines.filter(line => line.kind === 'add').length,
    removed: lines.filter(line => line.kind === 'del').length,
    lines: lines.slice(0, MAX_DIFF_LINES),
    hidden: Math.max(0, lines.length - MAX_DIFF_LINES),
  }
}

const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit'])

// The one suggestion the edits button sends back (ChatProtocol.PermissionResponse): the others save rules for good.
const isSessionEdits = (suggestion: Json) =>
  suggestion.type === 'setMode' && suggestion.mode === 'acceptEdits' && suggestion.destination === 'session'

// Tools whose result never came: the turn ended without one.
const settle = (items: ChatItem[], status: ToolStatus) =>
  items.map(item => (item.kind === 'tool' && item.status === 'running' ? { ...item, status } : item))

// Text still streaming becomes a message of its own when something else interrupts it.
function flush(state: ChatState): ChatState {
  return state.draft ? { ...state, items: [...state.items, { kind: 'assistant', text: state.draft }], draft: '' } : state
}

function onLine(state: ChatState, line: string, at: number): ChatState {
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
          const input = isJson(block.input) ? block.input : {}
          const flushed = flush(next)
          next = {
            ...flushed,
            items: [
              ...flushed.items,
              { kind: 'tool', id: text(block.id), name, summary: toolSummary(name, input), status: 'running', diff: diffOf(name, input) },
            ],
          }
        }
      }

      return next
    }
    case 'user': {
      const message = isJson(event.message) ? event.message : {}
      const results = Array.isArray(message.content) ? message.content.filter(isJson).filter(block => block.type === 'tool_result') : []
      const statuses = new Map(results.map(block => [text(block.tool_use_id), block.is_error === true ? 'error' : 'done'] as const))

      return statuses.size === 0
        ? state
        : {
            ...state,
            items: state.items.map(item => (item.kind === 'tool' ? { ...item, status: statuses.get(item.id) ?? item.status } : item)),
          }
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
        toolUseId: text(request.tool_use_id),
        tool,
        detail: permissionDetail(tool, input, text(request.description) || tool),
        canAllowEdits: EDIT_TOOLS.has(tool) && suggestions.some(isSessionEdits),
        askedAt: at,
        diff: diffOf(tool, input),
      }
      const flushed = flush(state)

      return { ...flushed, items: [...flushed.items, card] }
    }
    case 'result': {
      const flushed = flush(state)
      const success = event.subtype === 'success'
      const notice: ChatItem[] = success ? [] : [{ kind: 'notice', text: 'Se detuvo antes de terminar.' }]

      return { ...flushed, busy: false, items: [...settle(flushed.items, success ? 'done' : 'error'), ...notice] }
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

      return {
        ...flushed,
        busy: false,
        items: [...settle(flushed.items, 'error'), { kind: 'notice', text: `La sesión terminó (código ${action.code}).` }],
      }
    }
    case 'line':
      return onLine(state, action.line, action.at)
  }
}

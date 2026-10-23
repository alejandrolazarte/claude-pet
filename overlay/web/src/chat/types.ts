export type Decision = 'allow' | 'allow-session-edits' | 'deny'

// 'cancelled': claude withdrew the question (an interrupt) or the turn ended with it open.
export type Answer = Decision | 'cancelled'

export type DiffLine = { kind: 'same' | 'del' | 'add'; text: string }

// `lines` is capped for display; `added` and `removed` count the whole change.
export type Diff = { file: string; added: number; removed: number; lines: DiffLine[]; hidden: number }

export type ToolStatus = 'running' | 'done' | 'error'

export type ToolItem = { kind: 'tool'; id: string; name: string; summary: string; status: ToolStatus; diff?: Diff }

export type ChatItem =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string }
  | ToolItem
  | {
      kind: 'permission'
      requestId: string
      toolUseId: string
      tool: string
      detail: string
      canAllowEdits: boolean
      askedAt: number
      diff?: Diff
      answer?: Answer
    }
  | { kind: 'notice'; text: string }

export type ChatState = { items: ChatItem[]; draft: string; busy: boolean; sessionId?: string }

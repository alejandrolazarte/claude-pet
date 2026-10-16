export type Decision = 'allow' | 'allow-session-edits' | 'deny'

export type ChatItem =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string }
  | { kind: 'tool'; id: string; name: string; summary: string }
  | { kind: 'permission'; requestId: string; tool: string; detail: string; canAllowEdits: boolean; answer?: Decision }
  | { kind: 'notice'; text: string }

export type ChatState = { items: ChatItem[]; draft: string; busy: boolean; sessionId?: string }

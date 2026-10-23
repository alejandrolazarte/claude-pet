import type { ChatItem, ToolItem } from './types'

// PermissionBroker.Timeout: past it the window denies the request itself.
export const PERMISSION_TIMEOUT_MS = 120_000

export type Block = { kind: 'item'; item: Exclude<ChatItem, ToolItem> } | { kind: 'steps'; tools: ToolItem[] }

export function blocksOf(items: ChatItem[]): Block[] {
  const blocks: Block[] = []
  for (const item of items) {
    const last = blocks.at(-1)
    if (item.kind === 'tool' && last?.kind === 'steps') {
      last.tools.push(item)
    } else {
      blocks.push(item.kind === 'tool' ? { kind: 'steps', tools: [item] } : { kind: 'item', item })
    }
  }

  return blocks
}

export const initials = (label: string) =>
  label
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(word => Array.from(word)[0] ?? '')
    .join('')
    .toUpperCase()

export function countdown(askedAt: number, now: number): string {
  const left = Math.min(PERMISSION_TIMEOUT_MS, Math.max(0, PERMISSION_TIMEOUT_MS - (now - askedAt)))
  const seconds = Math.ceil(left / 1000)

  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

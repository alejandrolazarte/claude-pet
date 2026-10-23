import type { Mood } from '../sessions'
import type { ChatItem, Decision } from './types'

export type ChatHostMessage =
  | { type: 'chat-init'; character: string; label: string; history: ChatItem[]; notice: string | null; error: string | null }
  | { type: 'chat-event'; line: string }
  | { type: 'chat-exit'; code: number }
  | { type: 'chat-permission-done'; requestId: string; decision: Decision }

export type ChatPageMessage =
  | { type: 'chat-ready' }
  | { type: 'chat-send'; text: string }
  | { type: 'chat-permission'; requestId: string; decision: Decision }
  | { type: 'chat-interrupt' }
  | { type: 'chat-new' }
  | { type: 'chat-resume' }
  | { type: 'chat-mood'; mood: Mood; label: string }

type ChatWebView = {
  postMessage: (message: ChatPageMessage) => void
  addEventListener: (type: 'message', listener: (event: { data: ChatHostMessage }) => void) => void
  removeEventListener: (type: 'message', listener: (event: { data: ChatHostMessage }) => void) => void
}

// The same window.chrome.webview as the pet page (declared in bridge.ts), typed with the chat's own messages.
const webview = () => window.chrome?.webview as unknown as ChatWebView | undefined

export const sendChat = (message: ChatPageMessage) => webview()?.postMessage(message)

export function onChatHostMessage(listener: (message: ChatHostMessage) => void): () => void {
  const view = webview()
  const handle = (event: { data: ChatHostMessage }) => listener(event.data)
  view?.addEventListener('message', handle)

  return () => view?.removeEventListener('message', handle)
}

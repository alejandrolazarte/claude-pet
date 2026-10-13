import type { Character, CharacterId } from './characters'
import type { CaptionMode, Session } from './sessions'

export type HostMessage =
  | { type: 'sessions'; sessions: Session[] }
  | { type: 'mouseleave' }
  | { type: 'character'; id: string | null }
  | { type: 'caption'; mode: string | null }
  | { type: 'sizes'; sizes: Record<string, unknown> | null }
  | { type: 'art'; characters: { id: string; label: string; svg: string; viewBox: string | null; parts: unknown; outline: unknown }[] }

export type PageMessage =
  | { type: 'ready' }
  | { type: 'drag' }
  | { type: 'menu'; characters: Character[]; current: CharacterId; caption: CaptionMode }
  | { type: 'size'; width: number; height: number }
  | { type: 'done'; character: CharacterId }

type WebView = {
  postMessage: (message: PageMessage) => void
  addEventListener: (type: 'message', listener: (event: { data: HostMessage }) => void) => void
  removeEventListener: (type: 'message', listener: (event: { data: HostMessage }) => void) => void
}

declare global {
  interface Window {
    chrome?: { webview?: WebView }
  }
}

export const send = (message: PageMessage) => window.chrome?.webview?.postMessage(message)

export function onHostMessage(listener: (message: HostMessage) => void): () => void {
  const webview = window.chrome?.webview
  const handle = (event: { data: HostMessage }) => listener(event.data)
  webview?.addEventListener('message', handle)

  return () => webview?.removeEventListener('message', handle)
}

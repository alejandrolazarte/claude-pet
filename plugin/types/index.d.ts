export type Mood = 'idle' | 'thinking' | 'working' | 'browsing' | 'asking' | 'happy' | 'sad' | 'sleeping'

export type PetState = { mood: Mood; label: string }

declare module 'claude-code' {
  interface PluginState {
    pet: { state: PetState }
  }
}

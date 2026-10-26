export type Mood = 'idle' | 'thinking' | 'working' | 'browsing' | 'asking' | 'happy' | 'sad' | 'sleeping'

export type PetState = { mood: Mood; label: string }

export type StepStatus = 'pending' | 'in_progress' | 'completed'

export type Step = { content: string; status: StepStatus }

declare module 'claude-code' {
  interface PluginState {
    pet: { state: PetState; steps: readonly Step[] }
  }
}

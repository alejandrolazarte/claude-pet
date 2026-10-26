export type Step = { content: string; status: 'pending' | 'in_progress' | 'completed' }

export function progressOf(steps: readonly Step[]): { position: number; total: number; isDone: boolean } {
  const current = steps.findIndex(step => step.status === 'in_progress')
  const done = steps.filter(step => step.status === 'completed').length

  return { position: current >= 0 ? current + 1 : Math.max(done, 1), total: steps.length, isDone: done === steps.length }
}

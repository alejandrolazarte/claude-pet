import type { Step, StepStatus } from '../types'

const UPDATE_PLAN = 'mcp__ccd_turn__update_plan'
const WRAP_UP = 'mcp__ccd_turn__wrap_up'

const STATUSES: readonly StepStatus[] = ['pending', 'in_progress', 'completed']

const withStatus = (steps: readonly Step[], status: StepStatus, at: (index: number) => boolean) =>
  steps.map((step, index) => (at(index) ? { ...step, status } : step))

function listed(items: unknown): Step[] | undefined {
  if (!Array.isArray(items)) {
    return undefined
  }

  return items.flatMap(item =>
    typeof item?.content === 'string' && STATUSES.includes(item.status) ? [{ content: item.content, status: item.status }] : [])
}

// The desktop app's task list: `items` replaces it, `advance` / `done` / `start` move it (1-based), wrap_up checks it all off.
export function stepsAfter(steps: readonly Step[], tool: string, input: Readonly<Record<string, unknown>>): readonly Step[] {
  if (tool === WRAP_UP) {
    return withStatus(steps, 'completed', () => true)
  }
  if (tool !== UPDATE_PLAN) {
    return steps
  }

  const items = listed(input.items)
  if (items) {
    return items
  }

  let next = steps
  if (input.advance === true) {
    const current = next.findIndex(step => step.status === 'in_progress')
    const following = next.findIndex((step, index) => index > current && step.status === 'pending')
    next = withStatus(withStatus(next, 'completed', index => index === current), 'in_progress', index => index === following)
  }
  if (Array.isArray(input.done)) {
    const done = input.done
    next = withStatus(next, 'completed', index => done.includes(index + 1))
  }
  if (typeof input.start === 'number') {
    const start = input.start
    next = withStatus(next, 'in_progress', index => index === start - 1)
  }

  return next
}

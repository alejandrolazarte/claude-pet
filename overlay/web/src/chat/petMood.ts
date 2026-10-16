import { activityOf } from '../../../../plugin/hooks/activity'
import type { Mood } from '../sessions'
import { isJson, parseLine, text } from './json'

export type PetMood = { mood: Mood; label: string }

export const SENT_MOOD: PetMood = { mood: 'thinking', label: 'pensando' }
export const IDLE_MOOD: PetMood = { mood: 'idle', label: 'esperando' }
// Like the mod's celebration after a turn.
export const CELEBRATE_MS = 4000

export function moodOfLine(line: string): PetMood | undefined {
  const event = parseLine(line)
  if (!event) {
    return undefined
  }
  if (event.type === 'control_request') {
    const request = isJson(event.request) ? event.request : {}

    return request.subtype === 'can_use_tool'
      ? { mood: 'asking', label: `te pregunta: ${text(request.description) || text(request.tool_name)}` }
      : undefined
  }
  if (event.type === 'assistant') {
    const message = isJson(event.message) ? event.message : {}
    const blocks = Array.isArray(message.content) ? message.content.filter(isJson) : []
    const tool = blocks.findLast(block => block.type === 'tool_use')

    return tool ? activityOf(text(tool.name), isJson(tool.input) ? tool.input : {}) : undefined
  }
  if (event.type === 'result') {
    return event.subtype === 'success' ? { mood: 'happy', label: 'listo' } : { mood: 'idle', label: 'detenido' }
  }

  return undefined
}

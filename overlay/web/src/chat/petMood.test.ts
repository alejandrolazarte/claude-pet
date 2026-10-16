import { describe, expect, it } from 'vitest'

import { moodOfLine } from './petMood'

const json = (value: unknown) => JSON.stringify(value)

describe('moodOfLine', () => {
  it('asks the user while a permission is pending', () => {
    // Act
    const mood = moodOfLine(json({ type: 'control_request', request_id: 'r1', request: { subtype: 'can_use_tool', tool_name: 'Write', description: 'hola.txt' } }))

    // Assert
    expect(mood).toEqual({ mood: 'asking', label: 'te pregunta: hola.txt' })
  })

  it('names the real command it asks about, not the description the model wrote for it', () => {
    // Act
    const mood = moodOfLine(
      json({
        type: 'control_request',
        request_id: 'r1',
        request: { subtype: 'can_use_tool', tool_name: 'Bash', input: { command: 'rm x.log', description: 'Ver la versión' }, description: 'Ver la versión' },
      }),
    )

    // Assert
    expect(mood).toEqual({ mood: 'asking', label: 'te pregunta: $ rm x.log' })
  })

  it('labels tools like the mod does', () => {
    // Act
    const mood = moodOfLine(json({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't', name: 'Edit', input: { file_path: 'C:\\repo\\foo.ts' } }] } }))

    // Assert
    expect(mood).toEqual({ mood: 'working', label: 'editando foo.ts' })
  })

  it('celebrates a finished turn and calms down after a stopped one', () => {
    // Act
    const finished = moodOfLine(json({ type: 'result', subtype: 'success' }))
    const stopped = moodOfLine(json({ type: 'result', subtype: 'error_during_execution' }))

    // Assert
    expect(finished).toEqual({ mood: 'happy', label: 'listo' })
    expect(stopped).toEqual({ mood: 'idle', label: 'detenido' })
  })

  it('leaves the mood alone for plain text and broken lines', () => {
    // Act
    const moods = [moodOfLine(json({ type: 'assistant', message: { content: [{ type: 'text', text: 'Hmph.' }] } })), moodOfLine('hola'), moodOfLine('[1]')]

    // Assert
    expect(moods).toEqual([undefined, undefined, undefined])
  })
})

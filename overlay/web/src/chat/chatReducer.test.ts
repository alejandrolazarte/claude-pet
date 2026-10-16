import { describe, expect, it } from 'vitest'

import { chatReducer, initialChat, type ChatAction } from './chatReducer'
import fixture from './fixtures/session.jsonl?raw'

const line = (value: unknown): ChatAction => ({ type: 'line', line: JSON.stringify(value) })
const run = (actions: ChatAction[]) => actions.reduce(chatReducer, initialChat)
const delta = (text: string) =>
  line({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } } })
const assistantText = (text: string) => line({ type: 'assistant', message: { content: [{ type: 'text', text }] } })
const toolUse = (name: string, input: Record<string, unknown>) =>
  line({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'toolu_1', name, input }] } })
const ask = (requestId: string, tool: string, input: Record<string, unknown>, suggestions: unknown[] = []) =>
  line({
    type: 'control_request',
    request_id: requestId,
    request: { subtype: 'can_use_tool', tool_name: tool, input, description: 'hola.txt', permission_suggestions: suggestions },
  })
const result = (subtype = 'success') => line({ type: 'result', subtype, is_error: subtype !== 'success', result: 'listo' })
const acceptEdits = { type: 'setMode', mode: 'acceptEdits', destination: 'session' }

describe('chatReducer', () => {
  it('keeps the session id from the init event', () => {
    // Act
    const state = run([line({ type: 'system', subtype: 'init', session_id: '715acc71' })])

    // Assert
    expect(state.sessionId).toBe('715acc71')
  })

  it('shows text as it arrives and replaces it with the final message', () => {
    // Act
    const streaming = run([delta('Hmph. '), delta('Lo')])
    const done = chatReducer(streaming, assistantText('Hmph. Lo miro.'))

    // Assert
    expect(streaming.draft).toBe('Hmph. Lo')
    expect(done.draft).toBe('')
    expect(done.items).toEqual([{ kind: 'assistant', text: 'Hmph. Lo miro.' }])
  })

  it('shows a tool as one compact line', () => {
    // Act
    const state = run([toolUse('Read', { file_path: 'C:\\repo\\src\\foo.ts' }), toolUse('Bash', { command: 'npm test' })])

    // Assert
    expect(state.items).toEqual([
      { kind: 'tool', id: 'toolu_1', name: 'Read', summary: 'foo.ts' },
      { kind: 'tool', id: 'toolu_1', name: 'Bash', summary: '$ npm test' },
    ])
  })

  it('stays busy from the user message until the result', () => {
    // Act
    const sent = run([{ type: 'sent', text: 'revisá el test' }])
    const working = chatReducer(chatReducer(sent, delta('Hmph')), toolUse('Read', { file_path: 'a.ts' }))
    const finished = chatReducer(working, result())

    // Assert
    expect(sent.items).toEqual([{ kind: 'user', text: 'revisá el test' }])
    expect([sent.busy, working.busy, finished.busy]).toEqual([true, true, false])
  })

  it('turns a permission request into a pending card, with the edits option only when offered', () => {
    // Act
    const state = run([ask('r1', 'Write', { file_path: 'C:\\work\\a.txt', content: 'a' }, [acceptEdits]), ask('r2', 'Bash', { command: 'git push' })])

    // Assert
    expect(state.items).toEqual([
      { kind: 'permission', requestId: 'r1', tool: 'Write', detail: 'C:\\work\\a.txt\na', canAllowEdits: true },
      { kind: 'permission', requestId: 'r2', tool: 'Bash', detail: '$ git push', canAllowEdits: false },
    ])
  })

  it('shows the file and the change for an edit request', () => {
    // Act
    const state = run([ask('r1', 'Edit', { file_path: 'C:\\repo\\foo.ts', old_string: 'viejo', new_string: 'nuevo' })])

    // Assert
    expect(state.items[0]).toMatchObject({ detail: 'C:\\repo\\foo.ts\n- viejo\n+ nuevo' })
  })

  it('marks a card answered, and only that one', () => {
    // Arrange
    const asked = run([ask('r1', 'Write', { file_path: 'a' }), ask('r2', 'Write', { file_path: 'b' })])

    // Act
    const state = chatReducer(asked, { type: 'answered', requestId: 'r2', decision: 'deny' })

    // Assert
    expect(state.items.map(item => (item.kind === 'permission' ? item.answer : undefined))).toEqual([undefined, 'deny'])
  })

  it('says so when the turn ends early, as after Detener', () => {
    // Act
    const state = run([{ type: 'sent', text: 'contá' }, delta('1\n2'), result('error_during_execution')])

    // Assert
    expect(state.busy).toBe(false)
    expect(state.draft).toBe('')
    expect(state.items.slice(1)).toEqual([
      { kind: 'assistant', text: '1\n2' },
      { kind: 'notice', text: 'Se detuvo antes de terminar.' },
    ])
  })

  it('ignores lines that are not a JSON object', () => {
    // Act
    const state = run(['hola', '42', '[1]', '{"type":'].map(text => ({ type: 'line', line: text })))

    // Assert
    expect(state).toBe(initialChat)
  })

  it('replays a recorded session to the end', () => {
    // Arrange
    const lines = fixture.split('\n').filter(text => text && !text.startsWith('>>> '))

    // Act
    const state = run(lines.map(text => ({ type: 'line', line: text })))

    // Assert
    expect(state.sessionId).toBeTruthy()
    expect(state.busy).toBe(false)
    expect(state.draft).toBe('')
    expect(state.items.some(item => item.kind === 'assistant')).toBe(true)
    expect(state.items.filter(item => item.kind === 'permission').length).toBeGreaterThanOrEqual(2)
  })
})

import { describe, expect, it } from 'vitest'

import { chatReducer, diffOf, initialChat, type ChatAction } from './chatReducer'
import type { ChatState } from './types'
import fixture from './fixtures/session.jsonl?raw'

const line = (value: unknown, at = 0): ChatAction => ({ type: 'line', line: JSON.stringify(value), at })
const run = (actions: ChatAction[]) => actions.reduce(chatReducer, initialChat)
const delta = (text: string) =>
  line({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } } })
const assistantText = (text: string) => line({ type: 'assistant', message: { content: [{ type: 'text', text }] } })
const toolUse = (name: string, input: Record<string, unknown>, id = 'toolu_1') =>
  line({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input }] } })
const toolResult = (id: string, isError = false) =>
  line({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: isError, content: 'x' }] } })
const ask = (requestId: string, tool: string, input: Record<string, unknown>, suggestions: unknown[] = [], at = 0) =>
  line(
    {
      type: 'control_request',
      request_id: requestId,
      request: {
        subtype: 'can_use_tool',
        tool_name: tool,
        input,
        description: 'hola.txt',
        permission_suggestions: suggestions,
        tool_use_id: `toolu_${requestId}`,
      },
    },
    at,
  )
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

  it('shows a tool as one compact line, running until its result', () => {
    // Act
    const state = run([toolUse('Read', { file_path: 'C:\\repo\\src\\foo.ts' }, 't1'), toolUse('Bash', { command: 'npm test' }, 't2')])

    // Assert
    expect(state.items).toEqual([
      { kind: 'tool', id: 't1', name: 'Read', summary: 'foo.ts', status: 'running' },
      { kind: 'tool', id: 't2', name: 'Bash', summary: '$ npm test', status: 'running' },
    ])
  })

  it('marks each tool done or failed when its result arrives', () => {
    // Act
    const state = run([
      toolUse('Read', { file_path: 'a.ts' }, 't1'),
      toolUse('Bash', { command: 'npm test' }, 't2'),
      toolUse('Write', { file_path: 'b.ts', content: 'b' }, 't3'),
      toolResult('t1'),
      toolResult('t2', true),
    ])

    // Assert
    expect(state.items.map(item => item.kind === 'tool' && item.status)).toEqual(['done', 'error', 'running'])
  })

  it('settles the tools still running when the turn ends: done after success, failed when cut short', () => {
    // Arrange
    const reading = toolUse('Read', { file_path: 'a.ts' })

    // Act
    const states = [run([reading, result()]), run([reading, result('error_during_execution')]), run([reading, { type: 'exit', code: 1 }])]

    // Assert
    expect(states.map(state => state.items.find(item => item.kind === 'tool')?.status)).toEqual(['done', 'error', 'error'])
  })

  it('shows an edit as a diff, with the lines both sides share as context', () => {
    // Act
    const state = run([
      toolUse('Edit', {
        file_path: 'C:\\repo\\sessions.test.ts',
        old_string: "it('orders', () => {\n  expect(ids).toEqual(['b', 'a'])\n})",
        new_string: "it('orders', () => {\n  expect(ids).toEqual(['a', 'b'])\n})",
      }),
    ])

    // Assert
    expect(state.items[0]).toMatchObject({
      diff: {
        file: 'sessions.test.ts',
        added: 1,
        removed: 1,
        hidden: 0,
        lines: [
          { kind: 'same', text: "it('orders', () => {" },
          { kind: 'del', text: "  expect(ids).toEqual(['b', 'a'])" },
          { kind: 'add', text: "  expect(ids).toEqual(['a', 'b'])" },
          { kind: 'same', text: '})' },
        ],
      },
    })
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
    const state = run([
      ask('r1', 'Write', { file_path: 'C:\\work\\a.txt', content: 'a' }, [acceptEdits], 1000),
      ask('r2', 'Bash', { command: 'git push' }),
    ])

    // Assert
    expect(state.items).toEqual([
      {
        kind: 'permission',
        requestId: 'r1',
        toolUseId: 'toolu_r1',
        tool: 'Write',
        detail: 'a.txt',
        canAllowEdits: true,
        askedAt: 1000,
        diff: { file: 'a.txt', added: 1, removed: 0, lines: [{ kind: 'add', text: 'a' }], hidden: 0 },
      },
      { kind: 'permission', requestId: 'r2', toolUseId: 'toolu_r2', tool: 'Bash', detail: '$ git push', canAllowEdits: false, askedAt: 0 },
    ])
  })

  it('offers edits for the chat only for file edits, and only as a mode of this session', () => {
    // Act
    const state = run([
      ask('r1', 'Bash', { command: 'rm x.log' }, [acceptEdits]),
      ask('r2', 'Write', { file_path: 'a.txt', content: 'a' }, [{ ...acceptEdits, destination: 'localSettings' }]),
      ask('r3', 'Edit', { file_path: 'a.txt', old_string: 'a', new_string: 'b' }, [acceptEdits]),
    ])

    // Assert
    expect(state.items.map(item => item.kind === 'permission' && item.canAllowEdits)).toEqual([false, false, true])
  })

  it('marks a card answered, and only that one', () => {
    // Arrange
    const asked = run([ask('r1', 'Write', { file_path: 'a' }), ask('r2', 'Write', { file_path: 'b' })])

    // Act
    const state = chatReducer(asked, { type: 'answered', requestId: 'r2', decision: 'deny' })

    // Assert
    expect(state.items.map(item => (item.kind === 'permission' ? item.answer : undefined))).toEqual([undefined, 'deny'])
  })

  it('closes a card claude withdraws, as after Detener, and any card still open when the turn ends', () => {
    // Arrange
    const asked = run([ask('r1', 'Write', { file_path: 'a' }), ask('r2', 'Write', { file_path: 'b' }), ask('r3', 'Write', { file_path: 'c' })])
    const answered = chatReducer(asked, { type: 'answered', requestId: 'r3', decision: 'allow' })

    // Act
    const withdrawn = chatReducer(answered, line({ type: 'control_cancel_request', request_id: 'r1' }))
    const ended = chatReducer(withdrawn, result('error_during_execution'))

    // Assert
    const answers = (state: ChatState) => state.items.flatMap(item => (item.kind === 'permission' ? [item.answer] : []))
    expect(answers(withdrawn)).toEqual(['cancelled', undefined, 'allow'])
    expect(answers(ended)).toEqual(['cancelled', 'cancelled', 'allow'])
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
    const state = run(['hola', '42', '[1]', '{"type":'].map(text => ({ type: 'line', line: text, at: 0 })))

    // Assert
    expect(state).toBe(initialChat)
  })

  it('replays a recorded session to the end', () => {
    // Arrange
    const lines = fixture.split('\n').filter(text => text && !text.startsWith('>>> '))

    // Act
    const state = run(lines.map(text => ({ type: 'line', line: text, at: 0 })))

    // Assert
    expect(state.sessionId).toBeTruthy()
    expect(state.busy).toBe(false)
    expect(state.draft).toBe('')
    expect(state.items.some(item => item.kind === 'assistant')).toBe(true)
    expect(state.items.filter(item => item.kind === 'permission').length).toBeGreaterThanOrEqual(2)
    expect(state.items.filter(item => item.kind === 'tool').map(item => item.status)).toEqual(['done', 'done', 'done'])
  })
})

describe('diffOf', () => {
  it('shows a new file as added lines, without the final newline as an extra one', () => {
    // Act
    const diff = diffOf('Write', { file_path: '/repo/a.ts', content: 'uno\ndos\n' })

    // Assert
    expect(diff).toEqual({
      file: 'a.ts',
      added: 2,
      removed: 0,
      lines: [
        { kind: 'add', text: 'uno' },
        { kind: 'add', text: 'dos' },
      ],
      hidden: 0,
    })
  })

  it('keeps the first lines and counts the rest as hidden, while the totals count every line', () => {
    // Act
    const diff = diffOf('Write', { file_path: 'a.ts', content: Array.from({ length: 15 }, (_, i) => `línea ${i}`).join('\n') })

    // Assert
    expect([diff?.added, diff?.lines.length, diff?.hidden]).toEqual([15, 12, 3])
  })

  it('reads CRLF text and does not count a shared line twice when one side is shorter', () => {
    // Act
    const crlf = diffOf('Edit', { file_path: 'a.ts', old_string: 'a\r\nb', new_string: 'a\r\nc' })
    const shorter = diffOf('Edit', { file_path: 'a.ts', old_string: 'x\nx', new_string: 'x' })

    // Assert
    expect(crlf?.lines.map(line => `${line.kind} ${line.text}`)).toEqual(['same a', 'del b', 'add c'])
    expect([shorter?.added, shorter?.removed]).toEqual([0, 1])
  })

  it('has no diff for tools that do not change a file', () => {
    // Act
    const diffs = [diffOf('Read', { file_path: 'a.ts' }), diffOf('Bash', { command: 'ls' }), diffOf('Edit', {})]

    // Assert
    expect(diffs).toEqual([undefined, undefined, undefined])
  })
})

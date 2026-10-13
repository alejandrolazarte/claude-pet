import { describe, expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'pet',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const mood = async (ui: { find: (q: { type: string }) => Promise<{ text: string } | undefined> }) =>
  (await ui.find({ type: 'Text' }))?.text

describe('pet', () => {
  test('follows the turn: thinking, working on a tool, happy at the end, idle, asleep', async ($, on) => {
    // Arrange
    const clock = mock.clock(on)
    on('turn.start', (_$, e) => ({ turnId: e.turnId }))
    on('turn.complete', (_$, e) => ({ text: e.answer }))
    let finishTool = () => {}
    on('tool.call', () => new Promise(resolve => { finishTool = () => resolve({ result: 'ok' }) }))
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

    // Act
    await $.turn.start({ text: 'hola', turnId: 't1' })
    const whileThinking = await mood(ui)
    const tool = $.tool.call({ tool: 'Bash', command: 'ls' })
    await clock.settle()
    const whileWorking = await mood(ui)
    finishTool()
    await tool
    await $.turn.complete({ answer: 'listo', durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer' })
    const atEnd = await mood(ui)
    await clock.advance(5_000)
    const afterwards = await mood(ui)
    await clock.advance(5 * 60_000)
    const later = await mood(ui)

    // Assert
    expect(whileThinking).toMatch(/pensando/)
    expect(whileWorking).toMatch(/comando/)
    expect(atEnd).toMatch(/listo/)
    expect(afterwards).toMatch(/esperando/)
    expect(later).toMatch(/durmiendo/)
  })

  test('is sad when the turn is interrupted', async ($, on) => {
    // Arrange
    mock.clock(on)
    on('turn.complete', (_$, e) => ({ text: e.answer }))
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

    // Act
    await $.turn.complete({ answer: '', durationMs: 10, isAborted: true, turnId: 't1', reason: 'aborted' })

    // Assert
    expect(await mood(ui)).toMatch(/interrump/)
  })

  test('browses while Claude drives a browser, saying what it does in the page', async ($, on) => {
    // Arrange
    const clock = mock.clock(on)
    let finishTool = () => {}
    on('tool.call', () => new Promise(resolve => { finishTool = () => resolve({ result: 'ok' }) }))
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    const during = async (call: Record<string, unknown>) => {
      const running = $.tool.call(call as never)
      await clock.settle()
      const shown = await mood(ui)
      finishTool()
      await running
      return shown
    }

    // Act
    const chromeClick = await during({ tool: 'mcp__claude-in-chrome__computer', action: 'left_click', coordinate: [10, 20] })
    const chromeTyping = await during({ tool: 'mcp__claude-in-chrome__computer', action: 'type', text: 'hola' })
    const paneNavigate = await during({ tool: 'mcp__Claude_Browser__navigate', url: 'https://example.com' })
    const paneReading = await during({ tool: 'mcp__Claude_Browser__get_page_text' })
    const playwrightShot = await during({ tool: 'mcp__playwright__browser_take_screenshot' })

    // Assert
    expect(chromeClick).toBe('(•_•)⌕ haciendo clic')
    expect(chromeTyping).toBe('(•_•)⌕ escribiendo en la página')
    expect(paneNavigate).toBe('(•_•)⌕ abriendo una página')
    expect(paneReading).toBe('(•_•)⌕ leyendo la página')
    expect(playwrightShot).toBe('(•_•)⌕ mirando la página')
  })

  test('keeps browsing between browser tools, and goes back to thinking after any other tool', async ($, on) => {
    // Arrange
    mock.clock(on)
    on('tool.call', () => ({ result: 'ok' }))
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

    // Act
    await $.tool.call({ tool: 'mcp__Claude_Browser__computer', action: 'screenshot' } as never)
    const afterBrowserTool = await mood(ui)
    await $.tool.call({ tool: 'Bash', command: 'ls' })
    const afterOtherTool = await mood(ui)

    // Assert
    expect(afterBrowserTool).toBe('(•_•)⌕ navegando')
    expect(afterOtherTool).toBe('(•_•)… pensando')
  })

  test('names the file it edits, writes or reads', async ($, on) => {
    // Arrange
    const clock = mock.clock(on)
    let finishTool = () => {}
    on('tool.call', () => new Promise(resolve => { finishTool = () => resolve({ result: 'ok' }) }))
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    const during = async (call: Record<string, unknown>) => {
      const running = $.tool.call(call as never)
      await clock.settle()
      const shown = await mood(ui)
      finishTool()
      await running
      return shown
    }

    // Act
    const editing = await during({ tool: 'Edit', file_path: 'C:\\repo\\src\\App.tsx', old_string: 'a', new_string: 'b' })
    const writing = await during({ tool: 'Write', file_path: '/home/me/notes.md', content: 'x' })
    const reading = await during({ tool: 'Read', file_path: 'C:\\repo\\Program.cs' })
    const notebook = await during({ tool: 'NotebookEdit', notebook_path: 'C:\\repo\\data.ipynb', new_source: 'x' })

    // Assert
    expect(editing).toBe('(ง•̀_•́)ง editando App.tsx')
    expect(writing).toBe('(ง•̀_•́)ง escribiendo notes.md')
    expect(reading).toBe('(ง•̀_•́)ง leyendo Program.cs')
    expect(notebook).toBe('(ง•̀_•́)ง editando data.ipynb')
  })

  test('tells test runs, builds, commits, pushes and installs apart from other commands', async ($, on) => {
    // Arrange
    const clock = mock.clock(on)
    let finishTool = () => {}
    on('tool.call', () => new Promise(resolve => { finishTool = () => resolve({ result: 'ok' }) }))
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    const during = async (command: string, tool = 'Bash') => {
      const running = $.tool.call({ tool, command } as never)
      await clock.settle()
      const shown = (await mood(ui))?.replace('(ง•̀_•́)ง ', '')
      finishTool()
      await running
      return shown
    }

    // Act
    const shown = {
      vitest: await during('cd web && npx vitest run'),
      dotnetTest: await during('dotnet test App.sln --no-restore'),
      pluginTest: await during('claude plugin test claude-pet/plugin'),
      build: await during('dotnet build --no-restore -v q'),
      npmBuild: await during('npm run build', 'PowerShell'),
      commit: await during('git add -A && git commit -m "feat: x"'),
      push: await during('git commit -m "x" && git push origin main'),
      install: await during('npm install --no-fund'),
      other: await during('ls -la'),
    }

    // Assert
    expect(shown).toEqual({
      vitest: 'corriendo tests',
      dotnetTest: 'corriendo tests',
      pluginTest: 'corriendo tests',
      build: 'compilando',
      npmBuild: 'compilando',
      commit: 'commiteando',
      push: 'pusheando',
      install: 'instalando',
      other: 'corriendo un comando',
    })
  })

  test('needs you while a question or a plan waits for your answer', async ($, on) => {
    // Arrange
    const clock = mock.clock(on)
    let answer = () => {}
    on('tool.call', () => new Promise(resolve => { answer = () => resolve({ result: 'ok' }) }))
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

    // Act
    const asking = $.tool.call({ tool: 'AskUserQuestion', questions: [] } as never)
    await clock.settle()
    const whileAsking = await mood(ui)
    answer()
    await asking
    const afterAnswer = await mood(ui)
    const plan = $.tool.call({ tool: 'ExitPlanMode' } as never)
    await clock.settle()
    const whilePlan = await mood(ui)
    answer()
    await plan

    // Assert
    expect(whileAsking).toBe('(°o°)! te hace una pregunta')
    expect(afterAnswer).toBe('(•_•)… pensando')
    expect(whilePlan).toBe('(°o°)! espera que apruebes el plan')
  })

  test('is sad for a moment when a tool fails, until the next one starts', async ($, on) => {
    // Arrange
    mock.clock(on)
    let fails = true
    on('tool.call', () => (fails ? { result: 'exit 1', isError: true } : { result: 'ok' }))
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

    // Act
    await $.tool.call({ tool: 'Bash', command: 'dotnet build' })
    const afterFailedCommand = await mood(ui)
    await $.tool.call({ tool: 'Read', file_path: 'C:\\missing.txt' })
    const afterFailedRead = await mood(ui)
    fails = false
    await $.tool.call({ tool: 'Bash', command: 'ls' })
    const afterSuccess = await mood(ui)

    // Assert
    expect(afterFailedCommand).toBe('(•︵•) falló un comando')
    expect(afterFailedRead).toBe('(•︵•) falló una herramienta')
    expect(afterSuccess).toBe('(•_•)… pensando')
  })

  test('other MCP tools keep counting as plain work', async ($, on) => {
    // Arrange
    const clock = mock.clock(on)
    let finishTool = () => {}
    on('tool.call', () => new Promise(resolve => { finishTool = () => resolve({ result: 'ok' }) }))
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

    // Act
    const running = $.tool.call({ tool: 'mcp__azure-devops__get_work_item', id: 1 } as never)
    await clock.settle()
    const shown = await mood(ui)
    finishTool()
    await running

    // Assert
    expect(shown).toMatch(/^\(ง•̀_•́\)ง usando mcp__azure-devops__get_work_item$/)
  })

  test('draws a text face on the terminal', async ($, on) => {
    // Arrange
    mock.clock(on)

    // Act
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

    // Assert
    expect(await mood(ui)).toMatch(/\(•‿•\) esperando/)
  })

  test('leaves the desktop band alone: the floating window shows the pet there', async ($, on) => {
    // Arrange
    mock.clock(on)
    on('ui.render', (engine, e) => {
      const { Text } = engine.ui.resolve(e)
      return <Text>engine band</Text>
    })

    // Act
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

    // Assert
    expect(await mood(ui)).toBe('engine band')
  })

  test('opens the floating window shipped inside the plugin when a session starts', async ($, on) => {
    // Arrange
    mock.clock(on)
    mock.env(on, {})
    const launched: string[][] = []
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    on('fs.exists', (_$, e) => ({ value: /[\\/]window[\\/]PetOverlay\.exe$/.test(e.path) }))
    on('process.run', (_$, e) => {
      launched.push([...e.argv])
      return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    })

    // Act
    await $.session.start({ cwd: 'C:\\repos\\x', surface: 'desktop', isInteractive: true })

    // Assert
    expect(launched).toHaveLength(1)
    expect(launched[0]?.slice(0, 4)).toEqual(['cmd.exe', '/c', 'start', ''])
    expect(launched[0]?.[4]).toMatch(/\\window\\PetOverlay\.exe$/)
  })

  test('CLAUDE_PET_OVERLAY points to another window, such as a development build', async ($, on) => {
    // Arrange
    mock.clock(on)
    mock.env(on, { CLAUDE_PET_OVERLAY: 'C:\\dev\\PetOverlay.exe' })
    const launched: string[][] = []
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    on('fs.exists', () => ({ value: true }))
    on('process.run', (_$, e) => {
      launched.push([...e.argv])
      return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    })

    // Act
    await $.session.start({ cwd: 'C:\\repos\\x', surface: 'desktop', isInteractive: true })

    // Assert
    expect(launched).toEqual([['cmd.exe', '/c', 'start', '', 'C:\\dev\\PetOverlay.exe']])
  })

  test('a non-interactive session (claude -p, the SDK) neither opens the window nor shows up in it', async ($, on) => {
    // Arrange
    mock.clock(on, { now: 1000 })
    mock.env(on, { TEMP: 'C:\\Temp' })
    const launched: string[][] = []
    const writes: string[] = []
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    on('session.id', () => ({ value: 'abc-123' }))
    on('session.root', () => ({ value: 'C:\\repos\\x' }))
    on('fs.exists', () => ({ value: true }))
    on('fs.write', (_$, e) => {
      writes.push(e.path)
      return { value: undefined }
    })
    on('process.run', (_$, e) => {
      launched.push([...e.argv])
      return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    })
    on('turn.start', (_$, e) => ({ turnId: e.turnId }))
    on('session.end', (_$, e) => ({ sessionId: e.sessionId }))

    // Act
    await $.session.start({ cwd: 'C:\\repos\\x', surface: null, isInteractive: false })
    await $.turn.start({ text: 'hola', turnId: 't1' })
    await $.session.end({ reason: 'other', sessionId: 'abc-123', resume: { id: 'abc-123' } })

    // Assert
    expect(launched).toEqual([])
    expect(writes).toEqual([])
  })

  test('does not try to open a window the plugin does not ship', async ($, on) => {
    // Arrange
    mock.clock(on)
    mock.env(on, {})
    const launched: string[][] = []
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    on('fs.exists', () => ({ value: false }))
    on('process.run', (_$, e) => {
      launched.push([...e.argv])
      return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    })

    // Act
    await $.session.start({ cwd: 'C:\\repos\\x', surface: 'desktop', isInteractive: true })

    // Assert
    expect(launched).toEqual([])
  })

  test('shares its state with the floating window through a file per session', async ($, on) => {
    // Arrange
    mock.clock(on, { now: 1000 })
    mock.env(on, { TEMP: 'C:\\Temp' })
    const writes: { path: string; text: string }[] = []
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    on('session.id', () => ({ value: 'abc-123' }))
    on('session.root', () => ({ value: 'C:\\repos\\my-project' }))
    on('fs.write', (_$, e) => {
      writes.push({ path: e.path, text: e.text })
      return { value: undefined }
    })
    on('turn.start', (_$, e) => ({ turnId: e.turnId }))
    on('session.end', (_$, e) => ({ sessionId: e.sessionId }))
    await $.session.start({ cwd: 'C:\\repos\\my-project', surface: 'desktop', isInteractive: true })

    // Act
    await $.turn.start({ text: 'hola', turnId: 't1' })
    const afterTurn = writes.at(-1)
    await $.session.end({ reason: 'other', sessionId: 'abc-123', resume: { id: 'abc-123' } })
    const afterEnd = writes.at(-1)

    // Assert
    expect(afterTurn?.path).toBe('C:\\Temp\\claude-pet\\abc-123.json')
    expect(JSON.parse(afterTurn?.text ?? '{}')).toEqual({
      sessionId: 'abc-123',
      repo: 'my-project',
      mood: 'thinking',
      label: 'pensando',
      updatedAt: 1000,
    })
    expect(JSON.parse(afterEnd?.text ?? '{}').mood).toBe('gone')
  })
})

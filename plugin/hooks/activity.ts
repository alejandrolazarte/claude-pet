import type { PetState } from '../types'

const TOOL_LABELS: Record<string, string> = {
  Edit: 'editando',
  Write: 'escribiendo',
  NotebookEdit: 'editando',
  Read: 'leyendo',
  Grep: 'buscando',
  Glob: 'buscando',
  Bash: 'corriendo un comando',
  PowerShell: 'corriendo un comando',
  WebFetch: 'navegando',
  WebSearch: 'navegando',
  Agent: 'delegando',
}

// Claude in Chrome, the desktop app's browser pane and Playwright.
const BROWSER_TOOL = /^mcp__(claude-in-chrome|Claude_Browser|playwright)__(?:browser_)?(.+)$/

const BROWSER_ACTIONS: Record<string, string> = {
  left_click: 'haciendo clic',
  right_click: 'haciendo clic',
  double_click: 'haciendo clic',
  triple_click: 'haciendo clic',
  click: 'haciendo clic',
  left_click_drag: 'arrastrando',
  drag: 'arrastrando',
  hover: 'pasando el mouse',
  type: 'escribiendo en la página',
  key: 'apretando teclas',
  press_key: 'apretando teclas',
  scroll: 'scrolleando',
  scroll_to: 'scrolleando',
  screenshot: 'mirando la página',
  take_screenshot: 'mirando la página',
  zoom: 'mirando la página',
  wait: 'esperando la página',
  wait_for: 'esperando la página',
  navigate: 'abriendo una página',
  navigate_back: 'volviendo atrás',
  preview_start: 'abriendo una página',
  read_page: 'leyendo la página',
  get_page_text: 'leyendo la página',
  find: 'leyendo la página',
  snapshot: 'leyendo la página',
  form_input: 'completando un formulario',
  fill_form: 'completando un formulario',
  select_option: 'completando un formulario',
  javascript_tool: 'ejecutando JS',
  evaluate: 'ejecutando JS',
}

const ASKING: Record<string, string> = {
  AskUserQuestion: 'te hace una pregunta',
  ExitPlanMode: 'espera que apruebes el plan',
}

const SHELL_TOOLS = new Set(['Bash', 'PowerShell'])

// First match wins: "git commit && git push" is a push.
const COMMANDS: [RegExp, string][] = [
  [/\b(vitest|jest|pytest|dotnet test|vstest|go test|cargo test|plugin test)\b|\b(npm|pnpm|yarn)( run)? test\b/, 'corriendo tests'],
  [/\b(dotnet build|msbuild|vite build|cargo build|tsc)\b|\b(npm|pnpm|yarn)( run)? build\b/, 'compilando'],
  [/\bgit push\b/, 'pusheando'],
  [/\bgit commit\b/, 'commiteando'],
  [/\b(npm|pnpm|yarn) (install|i|add|ci)\b|\bdotnet restore\b/, 'instalando'],
]

const FILE_TOOLS = new Set(['Edit', 'Write', 'Read', 'NotebookEdit'])

const fileName = (path: string) => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path

export function activityOf(tool: string, input: Readonly<Record<string, unknown>>): PetState {
  const browser = BROWSER_TOOL.exec(tool)
  if (browser) {
    const name = browser[2] ?? ''
    const action = name === 'computer' && typeof input.action === 'string' ? input.action : name

    return { mood: 'browsing', label: BROWSER_ACTIONS[action] ?? 'navegando' }
  }

  const asking = ASKING[tool]
  if (asking) {
    return { mood: 'asking', label: asking }
  }

  if (SHELL_TOOLS.has(tool) && typeof input.command === 'string') {
    const command = input.command
    const kind = COMMANDS.find(([pattern]) => pattern.test(command))

    return { mood: 'working', label: kind?.[1] ?? 'corriendo un comando' }
  }

  const label = TOOL_LABELS[tool] ?? `usando ${tool}`
  const path = input.file_path ?? input.notebook_path
  if (FILE_TOOLS.has(tool) && typeof path === 'string') {
    return { mood: 'working', label: `${label} ${fileName(path)}` }
  }

  return { mood: 'working', label }
}

export function failureOf(tool: string): PetState {
  return { mood: 'sad', label: SHELL_TOOLS.has(tool) ? 'falló un comando' : 'falló una herramienta' }
}

export type Json = Record<string, unknown>

export const isJson = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)

export const text = (value: unknown): string => (typeof value === 'string' ? value : '')

// Only objects count: claude's stream is one JSON object per line, anything else is noise.
export function parseLine(line: string): Json | undefined {
  try {
    const value: unknown = JSON.parse(line)

    return isJson(value) ? value : undefined
  } catch {
    return undefined
  }
}

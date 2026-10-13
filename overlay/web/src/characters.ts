export type CharacterId = string

export type Character = { id: CharacterId; label: string }

const BLOB: Character = { id: 'blob', label: 'Bicho blanco' }

export function availableCharacters(art: { custom: readonly Character[] }): Character[] {
  return [...art.custom.filter(c => c.id !== BLOB.id), BLOB]
}

// The menu's size slider saves a percent per character; settings.json is hand-editable, so clamp it.
export function scaleOf(sizes: Record<string, unknown> | null, id: CharacterId): number {
  const percent = sizes?.[id]

  return typeof percent === 'number' && Number.isFinite(percent) ? Math.min(250, Math.max(50, percent)) / 100 : 1
}

export function resolveCharacter(saved: string | undefined, available: readonly Character[]): CharacterId {
  return available.find(c => c.id === saved)?.id ?? available[0]?.id ?? BLOB.id
}

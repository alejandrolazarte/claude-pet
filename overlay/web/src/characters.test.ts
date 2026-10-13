import { describe, expect, it } from 'vitest'

import { availableCharacters, resolveCharacter, scaleOf } from './characters'

const KITSUNE = { id: 'kitsune', label: 'Kitsune' }
const POCHITA = { id: 'pochita', label: 'Pochita' }
const ALL_ART = { custom: [KITSUNE, POCHITA] }
const NO_ART = { custom: [] }

describe('availableCharacters', () => {
  it('lists every character folder with its label, the blob last', () => {
    // Act
    const characters = availableCharacters(ALL_ART)

    // Assert
    expect(characters).toEqual([KITSUNE, POCHITA, { id: 'blob', label: 'Bicho blanco' }])
  })

  it('skips a folder that would shadow the built-in blob', () => {
    // Act
    const ids = availableCharacters({ custom: [{ id: 'blob', label: 'Otro blob' }, POCHITA] }).map(c => c.id)

    // Assert
    expect(ids).toEqual(['pochita', 'blob'])
  })

  it('offers only the blob without any art', () => {
    // Act
    const ids = availableCharacters(NO_ART).map(c => c.id)

    // Assert
    expect(ids).toEqual(['blob'])
  })
})

describe('resolveCharacter', () => {
  it('keeps the saved character when it is available', () => {
    // Act
    const character = resolveCharacter('pochita', availableCharacters(ALL_ART))

    // Assert
    expect(character).toBe('pochita')
  })

  it('falls back to the first available when the saved one is gone', () => {
    // Act
    const character = resolveCharacter('kitsune', availableCharacters(NO_ART))

    // Assert
    expect(character).toBe('blob')
  })

  it('falls back to the first available when nothing was saved or the value is unknown', () => {
    // Act
    const unsaved = resolveCharacter(undefined, availableCharacters(ALL_ART))
    const unknown = resolveCharacter('dragon', availableCharacters(ALL_ART))

    // Assert
    expect(unsaved).toBe('kitsune')
    expect(unknown).toBe('kitsune')
  })
})

describe('scaleOf', () => {
  it('turns the saved percent of the character into a scale', () => {
    // Act
    const scale = scaleOf({ kitsune: 150, pochita: 80 }, 'kitsune')

    // Assert
    expect(scale).toBe(1.5)
  })

  it('is 1 for a character without a size, or with a value that is not a number', () => {
    // Act
    const unsaved = scaleOf({ pochita: 80 }, 'kitsune')
    const text = scaleOf({ kitsune: '150' }, 'kitsune')
    const noSizes = scaleOf(null, 'kitsune')

    // Assert
    expect([unsaved, text, noSizes]).toEqual([1, 1, 1])
  })

  it('keeps a hand-edited value between 50% and 250%', () => {
    // Act
    const tiny = scaleOf({ kitsune: 5 }, 'kitsune')
    const huge = scaleOf({ kitsune: 900 }, 'kitsune')

    // Assert
    expect([tiny, huge]).toEqual([0.5, 2.5])
  })
})

import { describe, expect, it } from 'vitest'

import { blocksOf, countdown, initials } from './present'
import type { ChatItem, ToolItem } from './types'

const tool = (id: string): ToolItem => ({ kind: 'tool', id, name: 'Read', summary: 'a.ts', status: 'done' })

describe('blocksOf', () => {
  it('groups consecutive tools into one card of steps', () => {
    // Arrange
    const user: ChatItem = { kind: 'user', text: '¿por qué falla?' }
    const reply: ChatItem = { kind: 'assistant', text: 'Lo corrijo.' }

    // Act
    const blocks = blocksOf([user, tool('t1'), tool('t2'), reply, tool('t3')])

    // Assert
    expect(blocks).toEqual([
      { kind: 'item', item: user },
      { kind: 'steps', tools: [tool('t1'), tool('t2')] },
      { kind: 'item', item: reply },
      { kind: 'steps', tools: [tool('t3')] },
    ])
  })
})

describe('initials', () => {
  it('takes the first letter of the first two words', () => {
    // Act
    const all = ['Itachi Uchiha', 'Obi-Wan Kenobi', 'Monkey D Luffy', 'Deku', 'ñandú ávila', '  ', '🐱 Gato'].map(initials)

    // Assert
    expect(all).toEqual(['IU', 'OK', 'MD', 'D', 'ÑÁ', '', '🐱G'])
  })
})

describe('countdown', () => {
  it('counts down the two minutes the window waits, rounding up and never past either end', () => {
    // Act
    const all = [countdown(0, 12_000), countdown(0, 0), countdown(0, 119_500), countdown(0, 200_000), countdown(5_000, 0)]

    // Assert
    expect(all).toEqual(['1:48', '2:00', '0:01', '0:00', '2:00'])
  })
})

import { describe, expect, it } from 'vitest'

import { movedBeyond } from './pointer'

describe('movedBeyond', () => {
  const start = { x: 100, y: 100 }

  it('counts a press released where it started as a tap', () => {
    // Act
    const moved = movedBeyond(start, { x: 100, y: 100 }, 4)

    // Assert
    expect(moved).toBe(false)
  })

  it('still counts a press that moved exactly the limit as a tap', () => {
    // Act
    const moved = [movedBeyond(start, { x: 104, y: 100 }, 4), movedBeyond(start, { x: 100, y: 96 }, 4)]

    // Assert
    expect(moved).toEqual([false, false])
  })

  it('starts a drag once the press goes past the limit in any direction', () => {
    // Act
    const moved = [movedBeyond(start, { x: 105, y: 100 }, 4), movedBeyond(start, { x: 100, y: 95 }, 4)]

    // Assert
    expect(moved).toEqual([true, true])
  })

  it('measures the straight distance, so a diagonal of 3 and 3 is past 4', () => {
    // Act
    const moved = movedBeyond(start, { x: 97, y: 103 }, 4)

    // Assert
    expect(moved).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'

import { progressOf, type Step } from './steps'

const steps = (...statuses: Step['status'][]): Step[] => statuses.map((status, i) => ({ content: `paso ${i + 1}`, status }))

describe('progressOf', () => {
  it('counts up to the step in progress', () => {
    // Arrange
    const list = steps('completed', 'in_progress', 'pending', 'pending')

    // Act
    const progress = progressOf(list)

    // Assert
    expect(progress).toEqual({ position: 2, total: 4, isDone: false })
  })

  it('between two steps, with none in progress, counts the ones done', () => {
    // Arrange
    const list = steps('completed', 'completed', 'pending')

    // Act
    const progress = progressOf(list)

    // Assert
    expect(progress).toEqual({ position: 2, total: 3, isDone: false })
  })

  it('is done once every step is checked off', () => {
    // Arrange
    const list = steps('completed', 'completed', 'completed')

    // Act
    const progress = progressOf(list)

    // Assert
    expect(progress).toEqual({ position: 3, total: 3, isDone: true })
  })

  it('a list that has not started yet is on its first step', () => {
    // Arrange
    const list = steps('pending', 'pending')

    // Act
    const progress = progressOf(list)

    // Assert
    expect(progress).toEqual({ position: 1, total: 2, isDone: false })
  })
})

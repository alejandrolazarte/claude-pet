import { describe, expect, it } from 'vitest'

import { questionsAfter } from './permissions'

const asked = { type: 'permission', requestId: 'r1', description: 'Toji: hola.txt' } as const

describe('questionsAfter', () => {
  it('queues a new question', () => {
    // Act
    const questions = questionsAfter([], asked)

    // Assert
    expect(questions).toEqual([{ requestId: 'r1', description: 'Toji: hola.txt' }])
  })

  it('ignores a question already in the queue', () => {
    // Act
    const questions = questionsAfter(questionsAfter([], asked), asked)

    // Assert
    expect(questions).toHaveLength(1)
  })

  it('drops a question answered anywhere, and nothing else', () => {
    // Arrange
    const two = questionsAfter(questionsAfter([], asked), { type: 'permission', requestId: 'r2', description: 'Toji: b.txt' })

    // Act
    const questions = questionsAfter(two, { type: 'permission-done', requestId: 'r1' })

    // Assert
    expect(questions.map(question => question.requestId)).toEqual(['r2'])
  })

  it('leaves the queue alone for an unknown answer', () => {
    // Arrange
    const one = questionsAfter([], asked)

    // Act
    const questions = questionsAfter(one, { type: 'permission-done', requestId: 'nope' })

    // Assert
    expect(questions).toEqual(one)
  })
})

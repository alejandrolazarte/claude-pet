export type Question = { requestId: string; description: string }

export type QuestionMessage = { type: 'permission'; requestId: string; description: string } | { type: 'permission-done'; requestId: string }

// The pet's bubble shows the oldest open question; an answer from the chat or the bubble closes it in both.
export function questionsAfter(questions: readonly Question[], message: QuestionMessage): Question[] {
  if (message.type === 'permission-done') {
    return questions.filter(question => question.requestId !== message.requestId)
  }

  return questions.some(question => question.requestId === message.requestId)
    ? [...questions]
    : [...questions, { requestId: message.requestId, description: message.description }]
}

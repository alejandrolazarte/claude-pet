import { progressOf, type Step } from './steps'

export function StepsBubble({ heading, steps }: { heading: string; steps: readonly Step[] }) {
  const { position, total, isDone } = progressOf(steps)

  return (
    <div className="steps-bubble">
      <header>
        <span>{heading}</span>
        <span>
          {position}/{total}
        </span>
      </header>
      <ol>
        {steps.map((step, index) => (
          <li key={index} className={step.status}>
            <span className={`dot ${step.status}`} />
            <span>{step.content}</span>
          </li>
        ))}
      </ol>
      {isDone && <div className="done">¡Listo!</div>}
    </div>
  )
}

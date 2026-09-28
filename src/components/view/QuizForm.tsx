import { type Quiz, useStore } from '../../app/store'

export function QuizForm({ quiz, line }: { quiz: Quiz; line: number }) {
  const next = useStore((s) => s.next)
  const checkGuess = useStore((s) => s.checkGuess)
  const setQuizInput = useStore((s) => s.setQuizInput)
  const skip = useStore((s) => s.go)
  const index = useStore((s) => s.index)
  const { name, answer } = quiz.question

  return (
    <form
      className={`narration quiz${quiz.result ? ` is-${quiz.result}` : ''}`}
      onSubmit={(e) => {
        e.preventDefault()
        if (quiz.result) next()
        else checkGuess()
      }}
    >
      <strong>
        Line {line} runs next. What will <code>{name}</code> be?
      </strong>
      {quiz.result ? (
        <span className="quiz-result">
          {quiz.result === 'right' ? 'Right: ' : 'Not quite. It becomes '}
          <code>{answer.v}</code>
        </span>
      ) : (
        <input
          className="quiz-input"
          value={quiz.input}
          onChange={(e) => setQuizInput(e.target.value)}
          autoFocus
          aria-label={`Your guess for ${name}`}
          spellCheck={false}
        />
      )}
      <button className="btn btn-primary" type="submit">
        {quiz.result ? 'Continue' : 'Check'}
      </button>
      {!quiz.result && (
        <button type="button" className="link-btn" onClick={() => skip(index + 1)}>
          Skip
        </button>
      )}
    </form>
  )
}

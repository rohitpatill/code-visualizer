export function OutputPanel({ stdout, prevStdout }: { stdout: string; prevStdout: string }) {
  const fresh = stdout.startsWith(prevStdout) ? stdout.slice(prevStdout.length) : ''
  return (
    <div className="output">
      <h2 className="pane-title">Output</h2>
      <pre>
        {stdout.slice(0, stdout.length - fresh.length)}
        <mark>{fresh}</mark>
        {!stdout && <span className="output-empty">Nothing printed yet</span>}
      </pre>
    </div>
  )
}

import { useEffect, useRef } from 'react'

// Strip ANSI escape sequences for clean display
const ANSI_RE = /\x1b\[[0-9;]*[mGKHFJABCDEF]/g
function strip(s) { return s.replace(ANSI_RE, '') }

const CLASS = {
  stdout: 'ts-out',
  stderr: 'ts-err',
  cmd:    'ts-cmd',
  done:   'ts-done',
  error:  'ts-err',
  info:   'ts-info',
}

export default function TerminalPanel({ lines, isRunning, procId, onClear, onKill, collapsed, onToggle }) {
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [lines])

  return (
    <div className={`term-panel${collapsed ? ' term-collapsed' : ''}`}>
      <div className="term-header">
        <button className="term-toggle" onClick={onToggle} title={collapsed ? 'Expand terminal' : 'Collapse terminal'}>
          <span className="term-toggle-arrow">{collapsed ? '▲' : '▼'}</span>
          Terminal
          {isRunning && !collapsed && <span className="term-running">● Running</span>}
        </button>

        {!collapsed && (
          <div className="term-actions">
            {isRunning && procId && (
              <button className="btn btn-sm btn-danger" onClick={() => onKill(procId)}>
                Stop ■
              </button>
            )}
            <button className="btn btn-sm btn-secondary" onClick={onClear}>
              Clear
            </button>
          </div>
        )}

        {collapsed && isRunning && (
          <span className="term-running term-running-collapsed">● Running</span>
        )}
      </div>

      {!collapsed && (
        <div className="term-body">
          <pre className="term-pre">
            {lines.length === 0 ? (
              <span className="ts-info">Ready — commands will stream here.</span>
            ) : (
              lines.map((line, i) => (
                <span key={i} className={CLASS[line.stream] ?? 'ts-out'}>
                  {strip(line.text)}
                </span>
              ))
            )}
            <span ref={endRef} />
          </pre>
        </div>
      )}
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import FormPanel from './components/FormPanel.jsx'
import OutputPanel from './components/OutputPanel.jsx'
import AzureAuthBar from './components/AzureAuthBar.jsx'
import TerminalPanel from './components/TerminalPanel.jsx'
import DiagnosticsPanel from './components/DiagnosticsPanel.jsx'
import { DEFAULT_STATE, STORAGE_KEY } from './lib/defaults.js'
import { generateAll } from './lib/builders.js'
import { buildValidationReport } from './lib/validator.js'

const IS_ELECTRON = !!window.electronAPI

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (!saved) return DEFAULT_STATE
    return {
      ...DEFAULT_STATE,
      ...saved,
      firewall:      { ...DEFAULT_STATE.firewall,   ...(saved.firewall   || {}) },
      frontDoor:     { ...DEFAULT_STATE.frontDoor,  ...(saved.frontDoor  || {}) },
      spokes:        saved.spokes        ?? DEFAULT_STATE.spokes,
      loadBalancers: saved.loadBalancers ?? DEFAULT_STATE.loadBalancers,
    }
  } catch {
    return DEFAULT_STATE
  }
}

export default function App() {
  // ── Builder state ──────────────────────────────────────────────────────────
  const [state,   setState]   = useState(loadState)
  const [outputs, setOutputs] = useState({})
  const [status,  setStatus]  = useState('Ready')
  const [view,    setView]    = useState('builder')

  // ── Terminal state ─────────────────────────────────────────────────────────
  const [termLines,     setTermLines]     = useState([])
  const [isRunning,     setIsRunning]     = useState(false)
  const [procId,        setProcId]        = useState(null)
  const [termCollapsed, setTermCollapsed] = useState(false)

  // ── Azure auth state ───────────────────────────────────────────────────────
  const [azAccount,     setAzAccount]     = useState(null)
  const [subscriptions, setSubscriptions] = useState([])
  const [psk,           setPsk]           = useState('')

  // Persist builder state
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  // Wire Electron IPC listeners once on mount
  useEffect(() => {
    if (!IS_ELECTRON) return
    const removeOutput = window.electronAPI.onPsOutput(({ data, stream }) => {
      setTermLines((prev) => [...prev, { text: data, stream }])
    })
    const removeDone = window.electronAPI.onPsDone(({ code }) => {
      setIsRunning(false)
      setProcId(null)
      setTermLines((prev) => [
        ...prev,
        { text: `\n[exit ${code}]\n`, stream: code === 0 ? 'done' : 'error' },
      ])
    })
    return () => { removeOutput(); removeDone() }
  }, [])

  // Check Azure login on startup
  useEffect(() => {
    if (!IS_ELECTRON) return
    window.electronAPI.azCurrentAccount()
      .then((acct) => {
        if (!acct) return
        setAzAccount(acct)
        return window.electronAPI.azGetAccounts()
      })
      .then((subs) => { if (subs) setSubscriptions(subs) })
      .catch(() => {})
  }, [])

  // ── Core run helpers ───────────────────────────────────────────────────────

  const runCommand = useCallback(async (cmd) => {
    if (!IS_ELECTRON || isRunning) return
    const id = Date.now().toString()
    setProcId(id)
    setIsRunning(true)
    setTermCollapsed(false)
    setTermLines((prev) => [...prev, { text: `\n> ${cmd}\n\n`, stream: 'cmd' }])
    await window.electronAPI.psExec(cmd, id)
  }, [isRunning])

  const runScript = useCallback(async (content, psk) => {
    if (!IS_ELECTRON || isRunning) return
    const id = Date.now().toString()
    setProcId(id)
    setIsRunning(true)
    setTermCollapsed(false)
    setTermLines((prev) => [...prev, { text: '\n> Running Deploy Script...\n\n', stream: 'cmd' }])
    await window.electronAPI.scriptRun(content, id, psk ?? '')
  }, [isRunning])

  const handleKill = useCallback((id) => {
    if (!IS_ELECTRON) return
    window.electronAPI.psKill(id)
    setIsRunning(false)
    setProcId(null)
    setTermLines((prev) => [...prev, { text: '\n[Killed by user]\n', stream: 'error' }])
  }, [])

  // ── Azure auth ─────────────────────────────────────────────────────────────

  const handleSignIn = useCallback(async (switchAccount = false) => {
    const cmd = switchAccount ? 'az login' : 'az login'
    await runCommand(cmd)
    if (!IS_ELECTRON) return
    try {
      const acct = await window.electronAPI.azCurrentAccount()
      if (acct) setAzAccount(acct)
      const subs = await window.electronAPI.azGetAccounts()
      if (subs) setSubscriptions(subs)
    } catch {}
  }, [runCommand])

  const handleSelectSub = useCallback(async (id) => {
    if (!IS_ELECTRON) return
    try {
      const acct = await window.electronAPI.azSetAccount(id)
      setAzAccount(acct)
    } catch (e) {
      console.error('Failed to switch subscription:', e)
    }
  }, [])

  // ── Builder generation ─────────────────────────────────────────────────────

  const handleGenerate = useCallback(() => {
    const result = generateAll(state)
    const report = buildValidationReport(state)
    setOutputs({ ...result, validate: report })
    const lbCount = state.loadBalancers.filter((lb) => lb.name.trim()).length
    const extras = [
      state.firewall.enabled  && 'Firewall',
      state.frontDoor.enabled && 'Front Door',
      lbCount > 0             && `${lbCount} LB`,
      state.nsgPerSpoke       && 'NSGs',
    ].filter(Boolean).join(' · ')
    setStatus(
      `Generated ${new Date().toLocaleTimeString()} — ${state.spokes.length} spoke(s), SKU: ${state.gwSku}${extras ? ` · ${extras}` : ''}`
    )
  }, [state])

  // Auto-generate on first load
  useEffect(() => { handleGenerate() }, []) // eslint-disable-line

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {IS_ELECTRON && (
        <AzureAuthBar
          account={azAccount}
          subscriptions={subscriptions}
          onSignIn={handleSignIn}
          onSelectSub={handleSelectSub}
          isRunning={isRunning}
          psk={psk}
          onPskChange={setPsk}
        />
      )}

      <header className="app-header">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <rect width="18" height="18" rx="3" fill="#0078d4" />
          <path d="M3 6h5v6H3zM10 3h5v5h-5zM10 11h5v4h-5z" fill="white" opacity="0.9" />
        </svg>
        <h1>Azure Network Builder</h1>

        <nav className="app-nav">
          <button
            className={`nav-tab${view === 'builder' ? ' active' : ''}`}
            onClick={() => setView('builder')}
          >
            Builder
          </button>
          <button
            className={`nav-tab${view === 'diagnostics' ? ' active' : ''}`}
            onClick={() => setView('diagnostics')}
          >
            Diagnostics
          </button>
        </nav>

        <p className="header-sub">PS1 · Bicep · Param · Deploy · Validate</p>
      </header>

      <div className="main-content">
        {view === 'builder' ? (
          <div className="layout">
            <FormPanel state={state} onChange={setState} />
            <OutputPanel
              outputs={outputs}
              status={status}
              onGenerate={handleGenerate}
              state={state}
              onDeploy={IS_ELECTRON ? runScript : null}
              isRunning={isRunning}
              psk={psk}
              onPskChange={setPsk}
            />
          </div>
        ) : (
          <DiagnosticsPanel
            state={state}
            onRun={runCommand}
            isRunning={isRunning}
          />
        )}
      </div>

      {IS_ELECTRON && (
        <TerminalPanel
          lines={termLines}
          isRunning={isRunning}
          procId={procId}
          onClear={() => setTermLines([])}
          onKill={handleKill}
          collapsed={termCollapsed}
          onToggle={() => setTermCollapsed((c) => !c)}
        />
      )}
    </>
  )
}

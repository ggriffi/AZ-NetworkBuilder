import { useState, useCallback } from 'react'
import { FILE_NAMES } from '../lib/defaults.js'
import { validate } from '../lib/validator.js'

const TABS = [
  { key: 'ps1',      label: 'PS1 Script' },
  { key: 'bicep',    label: 'Bicep Template' },
  { key: 'param',    label: 'Param File' },
  { key: 'deploy',   label: 'Deploy Script' },
  { key: 'validate', label: 'Validate' },
]

function dl(name, content) {
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([content], { type: 'text/plain' })),
    download: name,
  })
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function TabLabel({ tabKey, label, state }) {
  if (tabKey !== 'validate') return label
  const { errors, warnings } = validate(state)
  if (errors.length > 0)
    return <>{label} <span className="tab-badge tab-badge-error">{errors.length}</span></>
  if (warnings.length > 0)
    return <>{label} <span className="tab-badge tab-badge-warn">{warnings.length}</span></>
  return <>{label} <span className="tab-badge tab-badge-ok">✓</span></>
}

export default function OutputPanel({ outputs, status, onGenerate, state, onDeploy, isRunning }) {
  const [activeTab, setActiveTab] = useState('ps1')
  const [psk, setPsk] = useState('')
  const [pskVisible, setPskVisible] = useState(false)

  const isValidateTab = activeTab === 'validate'
  const isDeployTab   = activeTab === 'deploy'
  const currentOutput = outputs[activeTab] ?? 'Click Generate ▶ to build output.'

  const handleCopy = useCallback(async () => {
    if (!isValidateTab) onGenerate()
    await navigator.clipboard.writeText(outputs[activeTab] ?? '')
  }, [outputs, activeTab, onGenerate, isValidateTab])

  const handleDownload = useCallback(() => {
    if (isValidateTab) return
    onGenerate()
    if (outputs[activeTab]) dl(FILE_NAMES[activeTab], outputs[activeTab])
  }, [outputs, activeTab, onGenerate, isValidateTab])

  const handleDownloadAll = useCallback(() => {
    onGenerate()
    let delay = 0
    Object.entries(FILE_NAMES).forEach(([tab, name]) => {
      if (outputs[tab]) setTimeout(() => dl(name, outputs[tab]), (delay += 200))
    })
  }, [outputs, onGenerate])

  const handleRunDeploy = useCallback(() => {
    if (!onDeploy || isRunning) return
    onGenerate()
    // Small timeout lets generate() state settle before reading outputs
    setTimeout(() => {
      const script = outputs.deploy
      if (script) onDeploy(script, psk)
    }, 50)
  }, [onDeploy, isRunning, onGenerate, outputs, psk])

  return (
    <div className="output-panel">
      <div className="output-header">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            className={`tab${activeTab === key ? ' active' : ''}`}
            onClick={() => setActiveTab(key)}
          >
            <TabLabel tabKey={key} label={label} state={state} />
          </button>
        ))}

        <div className="output-actions">
          <button className="btn btn-secondary" onClick={handleCopy}>
            Copy
          </button>
          {!isValidateTab && (
            <>
              <button className="btn btn-secondary" onClick={handleDownload}>
                Download
              </button>
              <button className="btn btn-secondary" onClick={handleDownloadAll}>
                Download All
              </button>
            </>
          )}
          <button className="btn btn-primary" onClick={onGenerate}>
            Generate ▶
          </button>
        </div>
      </div>

      {/* Deploy tab: PSK input + Run button */}
      {isDeployTab && onDeploy && (
        <div className="deploy-bar">
          <span className="deploy-bar-label">VPN PSK</span>
          <div className="deploy-psk-wrap">
            <input
              className="deploy-psk-input"
              type={pskVisible ? 'text' : 'password'}
              value={psk}
              onChange={(e) => setPsk(e.target.value)}
              placeholder="Pre-shared key (injected via stdin)"
            />
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setPskVisible((v) => !v)}
              title={pskVisible ? 'Hide' : 'Show'}
            >
              {pskVisible ? '🙈' : '👁'}
            </button>
          </div>
          <button
            className="btn btn-azure btn-sm"
            onClick={handleRunDeploy}
            disabled={isRunning}
          >
            {isRunning ? 'Running…' : 'Run Script ▶'}
          </button>
        </div>
      )}

      <pre className="output-pre">{currentOutput}</pre>

      <div className="status-bar">{status}</div>
    </div>
  )
}

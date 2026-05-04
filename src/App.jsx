import { useState, useEffect, useCallback } from 'react';
import FormPanel from './components/FormPanel.jsx';
import OutputPanel from './components/OutputPanel.jsx';
import { DEFAULT_STATE, STORAGE_KEY } from './lib/defaults.js';
import { generateAll } from './lib/builders.js';
import { buildValidationReport } from './lib/validator.js';

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved) return DEFAULT_STATE;
    // Deep merge so new nested keys (firewall, frontDoor) get defaults
    return {
      ...DEFAULT_STATE,
      ...saved,
      firewall:      { ...DEFAULT_STATE.firewall,   ...(saved.firewall   || {}) },
      frontDoor:     { ...DEFAULT_STATE.frontDoor,  ...(saved.frontDoor  || {}) },
      spokes:        saved.spokes        ?? DEFAULT_STATE.spokes,
      loadBalancers: saved.loadBalancers ?? DEFAULT_STATE.loadBalancers,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export default function App() {
  const [state, setState] = useState(loadState);
  const [outputs, setOutputs] = useState({});
  const [status, setStatus] = useState('Ready');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const handleGenerate = useCallback(() => {
    const result = generateAll(state);
    const report = buildValidationReport(state);
    setOutputs({ ...result, validate: report });
    const lbCount = state.loadBalancers.filter((lb) => lb.name.trim()).length;
    const extras = [
      state.firewall.enabled && 'Firewall',
      state.frontDoor.enabled && 'Front Door',
      lbCount > 0 && `${lbCount} LB`,
      state.nsgPerSpoke && 'NSGs',
    ]
      .filter(Boolean)
      .join(' · ');
    setStatus(
      `Generated ${new Date().toLocaleTimeString()} — ${state.spokes.length} spoke(s), SKU: ${state.gwSku}${extras ? ` · ${extras}` : ''}`
    );
  }, [state]);

  // Auto-generate on first load
  useEffect(() => {
    handleGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <header className="app-header">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <rect width="18" height="18" rx="3" fill="#0078d4" />
          <path d="M3 6h5v6H3zM10 3h5v5h-5zM10 11h5v4h-5z" fill="white" opacity="0.9" />
        </svg>
        <h1>Azure Hub-Spoke Network Builder</h1>
        <p>PS1 · Bicep · Param · Deploy · Validate</p>
      </header>

      <div className="layout">
        <FormPanel state={state} onChange={setState} />
        <OutputPanel
          outputs={outputs}
          status={status}
          onGenerate={handleGenerate}
          state={state}
        />
      </div>
    </>
  );
}

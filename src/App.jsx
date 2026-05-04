import { useState, useEffect, useCallback } from 'react';
import FormPanel from './components/FormPanel.jsx';
import OutputPanel from './components/OutputPanel.jsx';
import { DEFAULT_STATE, STORAGE_KEY } from './lib/defaults.js';
import { generateAll } from './lib/builders.js';

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return saved ? { ...DEFAULT_STATE, ...saved } : DEFAULT_STATE;
  } catch {
    return DEFAULT_STATE;
  }
}

export default function App() {
  const [state, setState] = useState(loadState);
  const [outputs, setOutputs] = useState({});
  const [status, setStatus] = useState('Ready');

  // Persist to localStorage whenever state changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  // Auto-generate on first load
  useEffect(() => {
    handleGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerate = useCallback(() => {
    const result = generateAll(state);
    setOutputs(result);
    setStatus(
      `Generated ${new Date().toLocaleTimeString()} — ${state.spokes.length} spoke(s), SKU: ${state.gwSku}`
    );
  }, [state]);

  return (
    <>
      <header className="app-header">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <rect width="18" height="18" rx="3" fill="#0078d4" />
          <path d="M3 6h5v6H3zM10 3h5v5h-5zM10 11h5v4h-5z" fill="white" opacity="0.9" />
        </svg>
        <h1>Azure Hub-Spoke Network Builder</h1>
        <p>Outputs PS1&nbsp;·&nbsp;Bicep template&nbsp;·&nbsp;Parameter file&nbsp;·&nbsp;Deploy script</p>
      </header>

      <div className="layout">
        <FormPanel state={state} onChange={setState} />
        <OutputPanel outputs={outputs} status={status} onGenerate={handleGenerate} />
      </div>
    </>
  );
}

import { useState, useCallback } from 'react';
import { FILE_NAMES } from '../lib/defaults.js';
import { validate } from '../lib/validator.js';

const TABS = [
  { key: 'ps1', label: 'PS1 Script' },
  { key: 'bicep', label: 'Bicep Template' },
  { key: 'param', label: 'Param File' },
  { key: 'deploy', label: 'Deploy Script' },
  { key: 'validate', label: 'Validate' },
];

function dl(name, content) {
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([content], { type: 'text/plain' })),
    download: name,
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function TabLabel({ tabKey, label, state }) {
  if (tabKey !== 'validate') return label;
  const { errors, warnings } = validate(state);
  if (errors.length > 0)
    return <>{label} <span className="tab-badge tab-badge-error">{errors.length}</span></>;
  if (warnings.length > 0)
    return <>{label} <span className="tab-badge tab-badge-warn">{warnings.length}</span></>;
  return <>{label} <span className="tab-badge tab-badge-ok">✓</span></>;
}

export default function OutputPanel({ outputs, status, onGenerate, state }) {
  const [activeTab, setActiveTab] = useState('ps1');

  const isValidateTab = activeTab === 'validate';
  const currentOutput = outputs[activeTab] ?? 'Click Generate ▶ to build output.';

  const handleCopy = useCallback(async () => {
    if (!isValidateTab) onGenerate();
    const text = outputs[activeTab] ?? '';
    await navigator.clipboard.writeText(text);
  }, [outputs, activeTab, onGenerate, isValidateTab]);

  const handleDownload = useCallback(() => {
    if (isValidateTab) return;
    onGenerate();
    if (outputs[activeTab]) dl(FILE_NAMES[activeTab], outputs[activeTab]);
  }, [outputs, activeTab, onGenerate, isValidateTab]);

  const handleDownloadAll = useCallback(() => {
    onGenerate();
    let delay = 0;
    Object.entries(FILE_NAMES).forEach(([tab, name]) => {
      if (outputs[tab]) setTimeout(() => dl(name, outputs[tab]), (delay += 200));
    });
  }, [outputs, onGenerate]);

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

      <pre className="output-pre">{currentOutput}</pre>

      <div className="status-bar">{status}</div>
    </div>
  );
}

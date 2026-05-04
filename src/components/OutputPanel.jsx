import { useState, useCallback } from 'react';
import { FILE_NAMES } from '../lib/defaults.js';

const TABS = [
  { key: 'ps1', label: 'PS1 Script' },
  { key: 'bicep', label: 'Bicep Template' },
  { key: 'param', label: 'Param File' },
  { key: 'deploy', label: 'Deploy Script' },
];

function dl(name, content) {
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([content], { type: 'text/plain' })),
    download: name,
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function OutputPanel({ outputs, status, onGenerate }) {
  const [activeTab, setActiveTab] = useState('ps1');

  const currentOutput = outputs[activeTab] ?? 'Click Generate ▶ to build output.';

  const handleCopy = useCallback(async () => {
    onGenerate();
    await navigator.clipboard.writeText(outputs[activeTab] ?? '');
  }, [outputs, activeTab, onGenerate]);

  const handleDownload = useCallback(() => {
    onGenerate();
    if (outputs[activeTab]) dl(FILE_NAMES[activeTab], outputs[activeTab]);
  }, [outputs, activeTab, onGenerate]);

  const handleDownloadAll = useCallback(() => {
    onGenerate();
    let delay = 0;
    TABS.forEach(({ key }) => {
      if (outputs[key]) {
        setTimeout(() => dl(FILE_NAMES[key], outputs[key]), (delay += 200));
      }
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
            {label}
          </button>
        ))}
        <div className="output-actions">
          <button className="btn btn-secondary" onClick={handleCopy}>
            Copy
          </button>
          <button className="btn btn-secondary" onClick={handleDownload}>
            Download
          </button>
          <button className="btn btn-secondary" onClick={handleDownloadAll}>
            Download All
          </button>
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

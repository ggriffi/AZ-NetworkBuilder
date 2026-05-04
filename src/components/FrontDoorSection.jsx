import { AFD_SKUS } from '../lib/defaults.js';

export default function FrontDoorSection({ frontDoor, onChange }) {
  function set(field) {
    return (e) => onChange({ ...frontDoor, [field]: e.target.value });
  }

  function toggle(field) {
    return (e) => onChange({ ...frontDoor, [field]: e.target.checked });
  }

  return (
    <div className="section">
      <div className="section-title">
        Azure Front Door
        <label className="section-toggle">
          <input type="checkbox" checked={frontDoor.enabled} onChange={toggle('enabled')} />
          Enable
        </label>
      </div>

      <div className={frontDoor.enabled ? '' : 'section-disabled'}>
        <div className="row2">
          <div className="field">
            <label>Profile Name</label>
            <input value={frontDoor.profileName} onChange={set('profileName')} />
          </div>
          <div className="field">
            <label>SKU</label>
            <select value={frontDoor.sku} onChange={set('sku')}>
              {AFD_SKUS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="row2">
          <div className="field">
            <label>Endpoint Name</label>
            <input value={frontDoor.endpointName} onChange={set('endpointName')} />
          </div>
          <div className="field">
            <label>Origin Hostname</label>
            <input
              placeholder="app.example.com"
              value={frontDoor.originHostname}
              onChange={set('originHostname')}
            />
          </div>
        </div>
        <div className="field">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={frontDoor.wafEnabled}
              onChange={toggle('wafEnabled')}
            />
            Enable WAF Policy (Premium SKU required)
          </label>
        </div>
        {frontDoor.wafEnabled && (
          <div className="field">
            <label>WAF Policy Name</label>
            <input value={frontDoor.wafPolicyName} onChange={set('wafPolicyName')} />
          </div>
        )}
      </div>
    </div>
  );
}

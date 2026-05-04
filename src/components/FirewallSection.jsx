import { FW_SKUS } from '../lib/defaults.js';

export default function FirewallSection({ firewall, onChange }) {
  function set(field) {
    return (e) => onChange({ ...firewall, [field]: e.target.value });
  }

  function toggle(field) {
    return (e) => onChange({ ...firewall, [field]: e.target.checked });
  }

  return (
    <div className="section">
      <div className="section-title">
        Azure Firewall
        <label className="section-toggle">
          <input type="checkbox" checked={firewall.enabled} onChange={toggle('enabled')} />
          Enable
        </label>
      </div>

      <div className={firewall.enabled ? '' : 'section-disabled'}>
        <div className="row2">
          <div className="field">
            <label>Firewall Name</label>
            <input value={firewall.name} onChange={set('name')} />
          </div>
          <div className="field">
            <label>Firewall SKU</label>
            <select value={firewall.sku} onChange={set('sku')}>
              {FW_SKUS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="row2">
          <div className="field">
            <label>Firewall Policy Name</label>
            <input value={firewall.policyName} onChange={set('policyName')} />
          </div>
          <div className="field">
            <label>Firewall Public IP Name</label>
            <input value={firewall.pipName} onChange={set('pipName')} />
          </div>
        </div>
        <div className="field">
          <label>AzureFirewallSubnet Prefix (/26 minimum)</label>
          <input value={firewall.subnetPrefix} onChange={set('subnetPrefix')} />
        </div>
        <div className="field">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={firewall.forceRoute}
              onChange={toggle('forceRoute')}
            />
            Force-route spoke traffic through firewall (UDR 0.0.0.0/0)
          </label>
        </div>
      </div>
    </div>
  );
}

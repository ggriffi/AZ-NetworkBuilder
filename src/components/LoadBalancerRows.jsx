import { DEFAULT_LB } from '../lib/defaults.js';

const PROTOCOLS = ['Tcp', 'Udp'];
const LB_TYPES = ['Internal', 'External'];
const LB_SKUS = ['Standard', 'Basic'];

export default function LoadBalancerRows({ loadBalancers, spokes, onChange }) {
  function update(index, field, value) {
    const next = loadBalancers.map((lb, i) =>
      i === index ? { ...lb, [field]: value } : lb
    );
    onChange(next);
  }

  function add() {
    const firstSpoke = spokes[0]?.name || '';
    onChange([...loadBalancers, { ...DEFAULT_LB, spoke: firstSpoke }]);
  }

  function remove(index) {
    onChange(loadBalancers.filter((_, i) => i !== index));
  }

  const vnetOptions = [{ name: '(hub)', value: '' }, ...spokes.map((s) => ({ name: s.name, value: s.name }))];

  return (
    <>
      {loadBalancers.length > 0 && (
        <div className="lb-header">
          <span>Name</span>
          <span>Type</span>
          <span>SKU</span>
          <span>VNet</span>
          <span>Frontend IP</span>
          <span>Port</span>
          <span>Proto</span>
          <span />
        </div>
      )}

      {loadBalancers.map((lb, i) => (
        <div key={i} className="lb-row">
          <input
            placeholder="lb-name"
            value={lb.name}
            onChange={(e) => update(i, 'name', e.target.value)}
          />
          <select value={lb.type} onChange={(e) => update(i, 'type', e.target.value)}>
            {LB_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select value={lb.sku} onChange={(e) => update(i, 'sku', e.target.value)}>
            {LB_SKUS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={lb.spoke}
            onChange={(e) => update(i, 'spoke', e.target.value)}
            disabled={lb.type === 'External'}
            title={lb.type === 'External' ? 'External LBs use a public IP, not a VNet' : ''}
          >
            {vnetOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.name}
              </option>
            ))}
          </select>
          <input
            placeholder={lb.type === 'Internal' ? 'Private IP (blank=dynamic)' : 'pip-name'}
            value={lb.frontendIp}
            onChange={(e) => update(i, 'frontendIp', e.target.value)}
            title={lb.type === 'External' ? 'Public IP resource name for external LB' : 'Leave blank for dynamic private IP assignment'}
          />
          <input
            type="number"
            min="1"
            max="65535"
            value={lb.port}
            onChange={(e) => update(i, 'port', parseInt(e.target.value, 10) || 80)}
            title="Frontend/backend port"
          />
          <select value={lb.protocol} onChange={(e) => update(i, 'protocol', e.target.value)}>
            {PROTOCOLS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <button className="btn-x" onClick={() => remove(i)} title="Remove load balancer">
            ✕
          </button>
        </div>
      ))}

      <button className="btn-add" onClick={add}>
        + Add Load Balancer
      </button>
    </>
  );
}

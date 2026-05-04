export default function SpokeRows({ spokes, onChange }) {
  function updateSpoke(index, field, value) {
    const next = spokes.map((s, i) => (i === index ? { ...s, [field]: value } : s));
    onChange(next);
  }

  function addSpoke() {
    onChange([...spokes, { name: '', addr: '', sub: '' }]);
  }

  function removeSpoke(index) {
    onChange(spokes.filter((_, i) => i !== index));
  }

  return (
    <>
      <div className="spoke-header">
        <span>Name</span>
        <span>Address Prefix</span>
        <span>Subnet Prefix</span>
        <span />
      </div>

      {spokes.map((spoke, i) => (
        <div className="spoke-row" key={i}>
          <input
            placeholder="vnet-spoke-X"
            value={spoke.name}
            onChange={(e) => updateSpoke(i, 'name', e.target.value)}
          />
          <input
            placeholder="10.X.0.0/16"
            value={spoke.addr}
            onChange={(e) => updateSpoke(i, 'addr', e.target.value)}
          />
          <input
            placeholder="10.X.1.0/24"
            value={spoke.sub}
            onChange={(e) => updateSpoke(i, 'sub', e.target.value)}
          />
          <button className="btn-x" onClick={() => removeSpoke(i)} title="Remove spoke">
            ✕
          </button>
        </div>
      ))}

      <button className="btn-add" onClick={addSpoke}>
        + Add Spoke
      </button>
    </>
  );
}

import SpokeRows from './SpokeRows.jsx';
import FirewallSection from './FirewallSection.jsx';
import LoadBalancerRows from './LoadBalancerRows.jsx';
import FrontDoorSection from './FrontDoorSection.jsx';
import {
  LOCATIONS,
  GW_SKUS,
  DH_GROUPS,
  PFS_GROUPS,
  IKE_ENCRYPTIONS,
  IKE_INTEGRITIES,
  IPSEC_ENCRYPTIONS,
  IPSEC_INTEGRITIES,
} from '../lib/defaults.js';

function Field({ label, children }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}

function SelectField({ label, value, options, onChange }) {
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((opt) =>
          typeof opt === 'string' ? (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ) : (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          )
        )}
      </select>
    </Field>
  );
}

export default function FormPanel({ state, onChange }) {
  function set(field) {
    return (e) => onChange({ ...state, [field]: e.target.value });
  }

  function setVal(field) {
    return (value) => onChange({ ...state, [field]: value });
  }

  function text(field, placeholder) {
    return <input value={state[field]} onChange={set(field)} placeholder={placeholder} />;
  }

  return (
    <div className="form-panel">
      {/* Deployment */}
      <div className="section">
        <div className="section-title">Deployment</div>
        <div className="row2">
          <Field label="Resource Group">{text('rg')}</Field>
          <SelectField
            label="Location"
            value={state.location}
            options={LOCATIONS}
            onChange={setVal('location')}
          />
        </div>
        <Field label="Delete Old Resource Group before deploy (PS1 only — leave blank to skip)">
          {text('oldRg', 'Leave blank to skip')}
        </Field>
      </div>

      {/* Hub Network */}
      <div className="section">
        <div className="section-title">Hub Network</div>
        <div className="row2">
          <Field label="Hub VNet Name">{text('hubName')}</Field>
          <Field label="Hub Address Prefix">{text('hubPrefix')}</Field>
        </div>
        <div className="row2">
          <Field label="Hub Subnet Name">{text('hubSubnetName')}</Field>
          <Field label="Hub Subnet Prefix">{text('hubSubnetPrefix')}</Field>
        </div>
        <Field label="Gateway Subnet Prefix (/27 minimum)">{text('gwPrefix')}</Field>
      </div>

      {/* Spokes */}
      <div className="section">
        <div className="section-title">
          Spoke Networks
          <label className="section-toggle">
            <input
              type="checkbox"
              checked={state.nsgPerSpoke}
              onChange={(e) => onChange({ ...state, nsgPerSpoke: e.target.checked })}
            />
            NSG per spoke
          </label>
        </div>
        <SpokeRows
          spokes={state.spokes}
          onChange={(spokes) => onChange({ ...state, spokes })}
        />
      </div>

      {/* Firewall */}
      <FirewallSection
        firewall={state.firewall}
        onChange={(firewall) => onChange({ ...state, firewall })}
      />

      {/* Load Balancers */}
      <div className="section">
        <div className="section-title">Load Balancers</div>
        <LoadBalancerRows
          loadBalancers={state.loadBalancers}
          spokes={state.spokes}
          onChange={(loadBalancers) => onChange({ ...state, loadBalancers })}
        />
      </div>

      {/* Front Door */}
      <FrontDoorSection
        frontDoor={state.frontDoor}
        onChange={(frontDoor) => onChange({ ...state, frontDoor })}
      />

      {/* VPN Gateway */}
      <div className="section">
        <div className="section-title">VPN Gateway</div>
        <div className="row2">
          <Field label="Public IP Name">{text('pipName')}</Field>
          <Field label="Gateway Name">{text('gwName')}</Field>
        </div>
        <SelectField
          label="Gateway SKU"
          value={state.gwSku}
          options={GW_SKUS}
          onChange={setVal('gwSku')}
        />
      </div>

      {/* S2S / Local Gateway */}
      <div className="section">
        <div className="section-title">S2S / Local Gateway</div>
        <div className="row2">
          <Field label="Local Gateway Name">{text('lngName')}</Field>
          <Field label="Connection Name">{text('connName')}</Field>
        </div>
        <div className="row2">
          <Field label="On-Prem Public IP">{text('onPremIp')}</Field>
          <Field label="On-Prem Prefixes (comma-separated)">{text('onPremPrefixes')}</Field>
        </div>
      </div>

      {/* IPsec Policy */}
      <div className="section">
        <div className="section-title">IPsec Policy</div>
        <div className="row2">
          <SelectField
            label="DH Group (Phase 1)"
            value={state.dhGroup}
            options={DH_GROUPS}
            onChange={setVal('dhGroup')}
          />
          <SelectField
            label="PFS Group (Phase 2)"
            value={state.pfsGroup}
            options={PFS_GROUPS}
            onChange={setVal('pfsGroup')}
          />
        </div>
        <div className="row2">
          <SelectField
            label="IKE Encryption"
            value={state.ikeEnc}
            options={IKE_ENCRYPTIONS}
            onChange={setVal('ikeEnc')}
          />
          <SelectField
            label="IKE Integrity"
            value={state.ikeInt}
            options={IKE_INTEGRITIES}
            onChange={setVal('ikeInt')}
          />
        </div>
        <div className="row2">
          <SelectField
            label="IPsec Encryption"
            value={state.ipsecEnc}
            options={IPSEC_ENCRYPTIONS}
            onChange={setVal('ipsecEnc')}
          />
          <SelectField
            label="IPsec Integrity"
            value={state.ipsecInt}
            options={IPSEC_INTEGRITIES}
            onChange={setVal('ipsecInt')}
          />
        </div>
        <Field label="SA Lifetime (seconds)">
          <input type="number" value={state.saLifetime} onChange={set('saLifetime')} />
        </Field>
      </div>
    </div>
  );
}

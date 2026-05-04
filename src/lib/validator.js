function ipToInt(ip) {
  return ip.split('.').reduce((acc, o) => (acc << 8) + parseInt(o, 10), 0) >>> 0;
}

function cidrToRange(cidr) {
  const [ip, prefixStr] = cidr.split('/');
  const prefix = parseInt(prefixStr, 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 32) return null;
  const mask = prefix === 0 ? 0 : (~((1 << (32 - prefix)) - 1)) >>> 0;
  const start = ipToInt(ip) & mask;
  const end = start + (~mask >>> 0);
  return { start, end, prefix };
}

function isValidIP(ip) {
  if (!ip) return false;
  const parts = ip.split('.');
  return (
    parts.length === 4 &&
    parts.every((o) => /^\d+$/.test(o) && parseInt(o, 10) <= 255)
  );
}

function isValidCIDR(cidr) {
  if (!cidr || !cidr.includes('/')) return false;
  const [ip, prefixStr] = cidr.split('/');
  if (!isValidIP(ip)) return false;
  const prefix = parseInt(prefixStr, 10);
  return !isNaN(prefix) && prefix >= 0 && prefix <= 32;
}

function cidrsOverlap(a, b) {
  const ra = cidrToRange(a);
  const rb = cidrToRange(b);
  if (!ra || !rb) return false;
  return ra.start <= rb.end && rb.start <= ra.end;
}

function isContained(inner, outer) {
  const ri = cidrToRange(inner);
  const ro = cidrToRange(outer);
  if (!ri || !ro) return true; // already reported as invalid CIDR
  return ri.start >= ro.start && ri.end <= ro.end;
}

function prefixLen(cidr) {
  return parseInt(cidr.split('/')[1], 10);
}

export function validate(state) {
  const errors = [];
  const warnings = [];
  const info = [];

  // ── Required fields ───────────────────────────────────────────────────────
  if (!state.rg.trim())        errors.push('Resource Group name is required.');
  if (!state.hubName.trim())   errors.push('Hub VNet name is required.');
  if (!state.gwName.trim())    errors.push('VPN Gateway name is required.');
  if (!state.lngName.trim())   errors.push('Local Network Gateway name is required.');
  if (!state.onPremIp.trim())  errors.push('On-premises public IP is required.');
  if (!state.onPremPrefixes.trim()) errors.push('On-premises address prefixes are required.');

  // ── IP / CIDR format ──────────────────────────────────────────────────────
  if (state.onPremIp.trim() && !isValidIP(state.onPremIp.trim()))
    errors.push(`Invalid IP address for On-Prem Public IP: "${state.onPremIp}"`);

  const onPremList = state.onPremPrefixes.split(',').map((s) => s.trim()).filter(Boolean);
  onPremList.forEach((p) => {
    if (!isValidCIDR(p)) errors.push(`Invalid CIDR in On-Prem Prefixes: "${p}"`);
  });

  const cidrChecks = [
    ['Hub Address Prefix', state.hubPrefix],
    ['Hub Subnet Prefix', state.hubSubnetPrefix],
    ['Gateway Subnet Prefix', state.gwPrefix],
  ];

  if (state.firewall.enabled)
    cidrChecks.push(['Firewall Subnet Prefix', state.firewall.subnetPrefix]);

  state.spokes.forEach((s, i) => {
    const label = s.name || `Spoke #${i + 1}`;
    cidrChecks.push([`${label} Address Prefix`, s.addr]);
    cidrChecks.push([`${label} Subnet Prefix`, s.sub]);
  });

  cidrChecks.forEach(([label, value]) => {
    if (!isValidCIDR(value))
      errors.push(`Invalid CIDR format for ${label}: "${value}"`);
  });

  // ── Subnet size constraints ───────────────────────────────────────────────
  if (isValidCIDR(state.gwPrefix) && prefixLen(state.gwPrefix) > 27)
    errors.push(`GatewaySubnet must be /27 or larger (got /${prefixLen(state.gwPrefix)}).`);

  if (state.firewall.enabled && isValidCIDR(state.firewall.subnetPrefix) && prefixLen(state.firewall.subnetPrefix) > 26)
    errors.push(`AzureFirewallSubnet must be /26 or larger (got /${prefixLen(state.firewall.subnetPrefix)}).`);

  // ── Subnets must be contained within their VNet ───────────────────────────
  const containmentChecks = [
    [state.hubSubnetPrefix, state.hubPrefix, 'Hub subnet', 'hub address space'],
    [state.gwPrefix, state.hubPrefix, 'GatewaySubnet', 'hub address space'],
  ];
  if (state.firewall.enabled)
    containmentChecks.push([state.firewall.subnetPrefix, state.hubPrefix, 'AzureFirewallSubnet', 'hub address space']);

  state.spokes.forEach((s, i) => {
    const label = s.name || `Spoke #${i + 1}`;
    containmentChecks.push([s.sub, s.addr, `${label} subnet`, `${label} address space`]);
  });

  containmentChecks.forEach(([inner, outer, innerLabel, outerLabel]) => {
    if (isValidCIDR(inner) && isValidCIDR(outer) && !isContained(inner, outer))
      errors.push(`${innerLabel} (${inner}) is not within ${outerLabel} (${outer}).`);
  });

  // ── CIDR overlap detection ────────────────────────────────────────────────
  const vnets = [
    { label: `Hub (${state.hubName || 'hub'})`, cidr: state.hubPrefix },
    ...state.spokes.map((s, i) => ({ label: s.name || `Spoke #${i + 1}`, cidr: s.addr })),
  ];

  for (let i = 0; i < vnets.length; i++) {
    for (let j = i + 1; j < vnets.length; j++) {
      if (isValidCIDR(vnets[i].cidr) && isValidCIDR(vnets[j].cidr) && cidrsOverlap(vnets[i].cidr, vnets[j].cidr))
        errors.push(`Address overlap: ${vnets[i].label} (${vnets[i].cidr}) overlaps with ${vnets[j].label} (${vnets[j].cidr}).`);
    }
  }

  // ── Duplicate name detection ──────────────────────────────────────────────
  const vnetNames = [state.hubName, ...state.spokes.map((s) => s.name)].filter(Boolean);
  const dupeVnets = vnetNames.filter((n, i) => vnetNames.indexOf(n) !== i);
  if (dupeVnets.length)
    errors.push(`Duplicate VNet names: ${[...new Set(dupeVnets)].join(', ')}`);

  const lbNames = state.loadBalancers.map((lb) => lb.name).filter(Boolean);
  const dupeLbs = lbNames.filter((n, i) => lbNames.indexOf(n) !== i);
  if (dupeLbs.length)
    errors.push(`Duplicate Load Balancer names: ${[...new Set(dupeLbs)].join(', ')}`);

  // ── Load Balancer validation ──────────────────────────────────────────────
  state.loadBalancers.forEach((lb, i) => {
    if (!lb.name.trim()) errors.push(`Load Balancer #${i + 1} is missing a name.`);
    if (!lb.spoke.trim()) errors.push(`Load Balancer "${lb.name || `#${i + 1}`}" has no VNet assigned.`);
    if (!lb.port || lb.port < 1 || lb.port > 65535)
      errors.push(`Load Balancer "${lb.name || `#${i + 1}`}" has an invalid port.`);
  });

  // ── Firewall validation ───────────────────────────────────────────────────
  if (state.firewall.enabled) {
    if (!state.firewall.name.trim())       errors.push('Azure Firewall name is required.');
    if (!state.firewall.policyName.trim()) errors.push('Firewall Policy name is required.');
    if (!state.firewall.pipName.trim())    errors.push('Firewall Public IP name is required.');
  }

  // ── Front Door validation ─────────────────────────────────────────────────
  if (state.frontDoor.enabled) {
    if (!state.frontDoor.profileName.trim())  errors.push('Front Door profile name is required.');
    if (!state.frontDoor.endpointName.trim()) errors.push('Front Door endpoint name is required.');
    if (!state.frontDoor.originHostname.trim()) errors.push('Front Door origin hostname is required.');
  }

  // ── Warnings ──────────────────────────────────────────────────────────────
  if (!state.gwSku.endsWith('AZ'))
    warnings.push(`Gateway SKU '${state.gwSku}' is not zone-redundant. Consider VpnGw1AZ or higher for production.`);

  if (state.firewall.enabled && !state.firewall.forceRoute)
    warnings.push('Azure Firewall is enabled but spoke force-routing (UDR) is disabled — east-west traffic will bypass the firewall.');

  if (!state.firewall.enabled && state.spokes.length > 0)
    warnings.push('No Azure Firewall configured. Consider enabling it to inspect spoke-to-spoke and internet-bound traffic.');

  if (state.frontDoor.enabled && !state.frontDoor.wafEnabled)
    warnings.push('Azure Front Door is enabled without a WAF policy. Enable WAF for production workloads.');

  if (!state.nsgPerSpoke)
    warnings.push('NSGs are not configured for spoke subnets. Consider enabling them to restrict lateral movement.');

  if (state.spokes.length === 0)
    warnings.push('No spoke VNets defined. The hub will have no workload connectivity.');

  // ── Info ──────────────────────────────────────────────────────────────────
  const activeLbs = state.loadBalancers.filter((lb) => lb.name.trim()).length;
  const peerPairs = (state.spokes.length * (state.spokes.length - 1)) / 2;
  let estMins = 30;
  if (state.firewall.enabled) estMins += 5;
  if (state.frontDoor.enabled) estMins += 3;

  info.push(`${state.spokes.length} spoke(s), ${activeLbs} load balancer(s), ${peerPairs} spoke-to-spoke peering pair(s).`);
  info.push(`Estimated deployment time: ~${estMins} minutes (VPN Gateway dominates).`);
  info.push('VPN PSK will be prompted at runtime — it is never stored in generated files.');

  return { errors, warnings, info };
}

export function buildValidationReport(state) {
  const { errors, warnings, info } = validate(state);
  const now = new Date().toLocaleTimeString();

  const d = {
    ...state,
    onPremPrefixes: state.onPremPrefixes.split(',').map((s) => s.trim()).filter(Boolean),
  };

  const HR = '─'.repeat(56);

  const block = (items, okMsg) =>
    items.length === 0
      ? `  ✓ ${okMsg}\n`
      : items.map((x) => `  ${x}`).join('\n') + '\n';

  const activeLbs = state.loadBalancers.filter((lb) => lb.name.trim()).length;
  let estMins = 30;
  if (state.firewall.enabled) estMins += 5;
  if (state.frontDoor.enabled) estMins += 3;

  // psk is @secure() and required — pass a placeholder for what-if (no real value is used)
  const whatIf = [
    'az deployment group what-if \\',
    `  --resource-group "${d.rg}" \\`,
    '  --template-file hub-spoke-vpn.bicep \\',
    '  --parameters hub-spoke-vpn.bicepparam \\',
    '  --parameters psk=placeholder',
  ].join('\n');

  const pad = (k, v) => `  ${k.padEnd(20)}: ${v}`;

  return [
    `╔${'═'.repeat(58)}╗`,
    `║  Configuration Validation Report${' '.repeat(25)}║`,
    `║  Generated ${now}${' '.repeat(Math.max(0, 46 - now.length))}║`,
    `╚${'═'.repeat(58)}╝`,
    '',
    `ERRORS (${errors.length})`,
    HR,
    block(errors.map((e) => `✕  ${e}`), 'No errors — configuration looks valid.'),
    `WARNINGS (${warnings.length})`,
    HR,
    block(warnings.map((w) => `⚠  ${w}`), 'No warnings.'),
    `INFO`,
    HR,
    block(info.map((i) => `·  ${i}`), ''),
    `SUMMARY`,
    HR,
    pad('Resource Group', d.rg),
    pad('Location', d.location),
    pad('Hub VNet', `${d.hubName} (${d.hubPrefix})`),
    pad('Spoke VNets', d.spokes.length),
    pad('VPN Gateway SKU', d.gwSku),
    pad('Load Balancers', activeLbs),
    pad('Azure Firewall', d.firewall.enabled ? `Enabled — ${d.firewall.sku}` : 'Disabled'),
    pad('Front Door', d.frontDoor.enabled ? `Enabled — ${d.frontDoor.sku}` : 'Disabled'),
    pad('NSGs per Spoke', d.nsgPerSpoke ? 'Yes' : 'No'),
    '',
    `ESTIMATED DEPLOYMENT TIME`,
    HR,
    '  VPN Gateway        ~30 minutes',
    ...(d.firewall.enabled  ? ['  Azure Firewall     ~5 minutes'] : []),
    ...(d.frontDoor.enabled ? ['  Front Door         ~3 minutes'] : []),
    `  Total (approx.)    ~${estMins} minutes`,
    '',
    `WHAT-IF PREVIEW`,
    HR,
    '  Preview all changes without deploying (psk=placeholder is safe for what-if):',
    '',
    ...whatIf.split('\n').map((l) => `  ${l}`),
    '',
    errors.length === 0
      ? '  ✓ Ready to deploy.'
      : `  ✕ Fix ${errors.length} error(s) before deploying.`,
  ].join('\n');
}

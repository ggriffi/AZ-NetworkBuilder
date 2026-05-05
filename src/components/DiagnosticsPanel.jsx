import { useState } from 'react'

// ── Reusable tool card ───────────────────────────────────────────────────────

function DiagCard({ title, description, fields, buildCmd, onRun, isRunning }) {
  const [vals, setVals] = useState(() => {
    const init = {}
    fields.forEach((f) => { init[f.key] = f.default ?? '' })
    return init
  })

  const set = (key, val) => setVals((prev) => ({ ...prev, [key]: val }))

  return (
    <div className="diag-card">
      <div className="diag-card-title">{title}</div>
      <div className="diag-card-desc">{description}</div>

      {fields.length > 0 && (
        <div className="diag-card-fields">
          {fields.map((f) => (
            <div key={f.key} className="diag-field">
              <label>{f.label}</label>
              {f.options ? (
                <select value={vals[f.key]} onChange={(e) => set(f.key, e.target.value)}>
                  {f.options.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={vals[f.key]}
                  onChange={(e) => set(f.key, e.target.value)}
                  placeholder={f.placeholder ?? ''}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <button
        className="btn btn-primary btn-sm diag-run-btn"
        onClick={() => onRun(buildCmd(vals))}
        disabled={isRunning}
      >
        Run ▶
      </button>
    </div>
  )
}

// ── Tool definitions ─────────────────────────────────────────────────────────

function buildTools(state) {
  const rg      = state?.rg      ?? ''
  const hub     = state?.hubName ?? ''
  const gw      = state?.gwName  ?? ''
  const fwName  = state?.firewall?.name ?? ''
  const fwPol   = state?.firewall?.policyName ?? ''
  const loc     = state?.location ?? 'eastus'

  return [
    {
      section: 'Network Watcher',
      cards: [
        {
          title: 'IP Flow Verify',
          description: 'Test if NSG rules allow or deny traffic to/from a VM NIC.',
          fields: [
            { key: 'rg',        label: 'Resource Group',   default: rg },
            { key: 'vm',        label: 'VM Name',          placeholder: 'my-vm' },
            { key: 'nic',       label: 'NIC Name',         placeholder: 'my-vm-nic' },
            { key: 'direction', label: 'Direction',        options: ['Inbound', 'Outbound'] },
            { key: 'protocol',  label: 'Protocol',         options: ['TCP', 'UDP'] },
            { key: 'localIp',   label: 'Local IP:Port',    placeholder: '10.220.1.4:80' },
            { key: 'remoteIp',  label: 'Remote IP:Port',   placeholder: '1.2.3.4:*' },
          ],
          buildCmd: (v) => `az network watcher test-ip-flow --direction ${v.direction} --local "${v.localIp}" --protocol ${v.protocol} --remote "${v.remoteIp}" --vm "${v.vm}" --nic "${v.nic}" --resource-group "${v.rg}"`,
        },
        {
          title: 'Next Hop',
          description: 'Determine next hop type for a packet originating from a VM.',
          fields: [
            { key: 'rg',       label: 'Resource Group', default: rg },
            { key: 'vm',       label: 'VM Name',        placeholder: 'my-vm' },
            { key: 'nic',      label: 'NIC Name',       placeholder: 'my-vm-nic' },
            { key: 'sourceIp', label: 'Source IP',      placeholder: '10.220.1.4' },
            { key: 'destIp',   label: 'Destination IP', placeholder: '10.221.1.5' },
          ],
          buildCmd: (v) => `az network watcher show-next-hop --dest-ip "${v.destIp}" --source-ip "${v.sourceIp}" --resource-group "${v.rg}" --vm "${v.vm}" --nic "${v.nic}" --output json`,
        },
        {
          title: 'Effective Routes',
          description: 'Show the effective route table applied to a VM NIC.',
          fields: [
            { key: 'rg',  label: 'Resource Group', default: rg },
            { key: 'nic', label: 'NIC Name',        placeholder: 'my-vm-nic' },
          ],
          buildCmd: (v) => `az network nic show-effective-route-table --name "${v.nic}" --resource-group "${v.rg}" --output table`,
        },
        {
          title: 'Effective NSG Rules',
          description: 'Show all effective NSG security rules applied to a NIC.',
          fields: [
            { key: 'rg',  label: 'Resource Group', default: rg },
            { key: 'nic', label: 'NIC Name',        placeholder: 'my-vm-nic' },
          ],
          buildCmd: (v) => `az network nic list-effective-nsg --name "${v.nic}" --resource-group "${v.rg}" --output json`,
        },
        {
          title: 'Connectivity Test',
          description: 'Test TCP/ICMP/HTTP connectivity from a VM to any destination.',
          fields: [
            { key: 'rg',       label: 'Resource Group',   default: rg },
            { key: 'source',   label: 'Source VM Name',   placeholder: 'my-vm' },
            { key: 'destAddr', label: 'Destination',      placeholder: '10.221.1.4 or hostname' },
            { key: 'destPort', label: 'Destination Port', placeholder: '443' },
            { key: 'protocol', label: 'Protocol',         options: ['Tcp', 'Icmp', 'Http', 'Https'] },
          ],
          buildCmd: (v) => `az network watcher test-connectivity --source-resource "${v.source}" --dest-address "${v.destAddr}" --dest-port ${v.destPort} --protocol ${v.protocol} --resource-group "${v.rg}" --output json`,
        },
        {
          title: 'Network Topology',
          description: 'Retrieve the full network topology for a resource group.',
          fields: [
            { key: 'rg', label: 'Resource Group', default: rg },
          ],
          buildCmd: (v) => `az network watcher show-topology --resource-group "${v.rg}" --output json`,
        },
      ],
    },

    {
      section: 'VPN & Gateways',
      cards: [
        {
          title: 'VPN Connection Status',
          description: 'Show full details and health of a VPN connection.',
          fields: [
            { key: 'rg',   label: 'Resource Group',  default: rg },
            { key: 'conn', label: 'Connection Name', placeholder: 'conn-home-unifi' },
          ],
          buildCmd: (v) => `az network vpn-connection show --name "${v.conn}" --resource-group "${v.rg}" --output json`,
        },
        {
          title: 'List VPN Connections',
          description: 'List all VPN connections in a resource group.',
          fields: [
            { key: 'rg', label: 'Resource Group', default: rg },
          ],
          buildCmd: (v) => `az network vpn-connection list --resource-group "${v.rg}" --output table`,
        },
        {
          title: 'VPN Gateway Status',
          description: 'Show VPN gateway configuration, SKU, and provisioning state.',
          fields: [
            { key: 'rg', label: 'Resource Group', default: rg },
            { key: 'gw', label: 'Gateway Name',   default: gw, placeholder: 'vng-hub' },
          ],
          buildCmd: (v) => `az network vnet-gateway show --name "${v.gw}" --resource-group "${v.rg}" --output json`,
        },
        {
          title: 'List VPN Gateways',
          description: 'List all Virtual Network gateways in a resource group.',
          fields: [
            { key: 'rg', label: 'Resource Group', default: rg },
          ],
          buildCmd: (v) => `az network vnet-gateway list --resource-group "${v.rg}" --output table`,
        },
        {
          title: 'VPN IPsec Policy',
          description: 'Show the custom IPsec/IKE policy on a VPN connection.',
          fields: [
            { key: 'rg',   label: 'Resource Group',  default: rg },
            { key: 'conn', label: 'Connection Name', placeholder: 'conn-home-unifi' },
          ],
          buildCmd: (v) => `az network vpn-connection ipsec-policy list --connection-name "${v.conn}" --resource-group "${v.rg}" --output json`,
        },
        {
          title: 'BGP Peer Status',
          description: 'Show BGP peer status and learned routes for a VPN gateway.',
          fields: [
            { key: 'rg', label: 'Resource Group', default: rg },
            { key: 'gw', label: 'Gateway Name',   default: gw, placeholder: 'vng-hub' },
          ],
          buildCmd: (v) => `az network vnet-gateway list-bgp-peer-status --name "${v.gw}" --resource-group "${v.rg}" --output table`,
        },
      ],
    },

    {
      section: 'NSG & Route Tables',
      cards: [
        {
          title: 'List NSGs',
          description: 'List all Network Security Groups in a resource group.',
          fields: [
            { key: 'rg', label: 'Resource Group', default: rg },
          ],
          buildCmd: (v) => `az network nsg list --resource-group "${v.rg}" --output table`,
        },
        {
          title: 'NSG Rules',
          description: 'List all security rules (inbound + outbound) in an NSG.',
          fields: [
            { key: 'rg',  label: 'Resource Group', default: rg },
            { key: 'nsg', label: 'NSG Name',        placeholder: 'nsg-spoke-01' },
          ],
          buildCmd: (v) => `az network nsg rule list --nsg-name "${v.nsg}" --resource-group "${v.rg}" --include-default --output table`,
        },
        {
          title: 'List Route Tables',
          description: 'List all user-defined route tables in a resource group.',
          fields: [
            { key: 'rg', label: 'Resource Group', default: rg },
          ],
          buildCmd: (v) => `az network route-table list --resource-group "${v.rg}" --output table`,
        },
        {
          title: 'Route Table Routes',
          description: 'List all routes defined in a route table (UDR).',
          fields: [
            { key: 'rg', label: 'Resource Group', default: rg },
            { key: 'rt', label: 'Route Table Name', placeholder: 'rt-spoke-01-udr' },
          ],
          buildCmd: (v) => `az network route-table route list --route-table-name "${v.rt}" --resource-group "${v.rg}" --output table`,
        },
        {
          title: 'Associate NSG to Subnet',
          description: 'Attach an NSG to a VNet subnet.',
          fields: [
            { key: 'rg',     label: 'Resource Group', default: rg },
            { key: 'vnet',   label: 'VNet Name',      default: hub },
            { key: 'subnet', label: 'Subnet Name',    placeholder: 'Hub-Services' },
            { key: 'nsg',    label: 'NSG Name',        placeholder: 'nsg-hub-services' },
          ],
          buildCmd: (v) => `az network vnet subnet update --vnet-name "${v.vnet}" --name "${v.subnet}" --resource-group "${v.rg}" --network-security-group "${v.nsg}"`,
        },
      ],
    },

    {
      section: 'VNets & Peerings',
      cards: [
        {
          title: 'List VNets',
          description: 'List all Virtual Networks in a resource group.',
          fields: [
            { key: 'rg', label: 'Resource Group', default: rg },
          ],
          buildCmd: (v) => `az network vnet list --resource-group "${v.rg}" --output table`,
        },
        {
          title: 'List Subnets',
          description: 'List all subnets inside a VNet with prefix and NSG info.',
          fields: [
            { key: 'rg',   label: 'Resource Group', default: rg },
            { key: 'vnet', label: 'VNet Name',      default: hub, placeholder: 'vnet-hub' },
          ],
          buildCmd: (v) => `az network vnet subnet list --vnet-name "${v.vnet}" --resource-group "${v.rg}" --output table`,
        },
        {
          title: 'List Peerings',
          description: 'List all VNet peerings and their state for a given VNet.',
          fields: [
            { key: 'rg',   label: 'Resource Group', default: rg },
            { key: 'vnet', label: 'VNet Name',      default: hub, placeholder: 'vnet-hub' },
          ],
          buildCmd: (v) => `az network vnet peering list --vnet-name "${v.vnet}" --resource-group "${v.rg}" --output table`,
        },
        {
          title: 'Peering Details',
          description: 'Show full details and sync state of a specific VNet peering.',
          fields: [
            { key: 'rg',      label: 'Resource Group', default: rg },
            { key: 'vnet',    label: 'VNet Name',      default: hub },
            { key: 'peering', label: 'Peering Name',   placeholder: 'hub-to-spoke-221' },
          ],
          buildCmd: (v) => `az network vnet peering show --name "${v.peering}" --vnet-name "${v.vnet}" --resource-group "${v.rg}" --output json`,
        },
        {
          title: 'List Public IPs',
          description: 'List all public IP addresses and their allocations.',
          fields: [
            { key: 'rg', label: 'Resource Group', default: rg },
          ],
          buildCmd: (v) => `az network public-ip list --resource-group "${v.rg}" --output table`,
        },
        {
          title: 'VNet Address Space',
          description: 'Show the address space and DNS config of a specific VNet.',
          fields: [
            { key: 'rg',   label: 'Resource Group', default: rg },
            { key: 'vnet', label: 'VNet Name',      default: hub },
          ],
          buildCmd: (v) => `az network vnet show --name "${v.vnet}" --resource-group "${v.rg}" --output json`,
        },
      ],
    },

    {
      section: 'Load Balancers & Front Door',
      cards: [
        {
          title: 'List Load Balancers',
          description: 'List all load balancers and their SKUs in a resource group.',
          fields: [
            { key: 'rg', label: 'Resource Group', default: rg },
          ],
          buildCmd: (v) => `az network lb list --resource-group "${v.rg}" --output table`,
        },
        {
          title: 'LB Backend Pool',
          description: 'Show backend pool members for a load balancer.',
          fields: [
            { key: 'rg',   label: 'Resource Group', default: rg },
            { key: 'lb',   label: 'LB Name',        placeholder: 'lb-spoke-internal' },
            { key: 'pool', label: 'Backend Pool',   placeholder: 'backend-pool' },
          ],
          buildCmd: (v) => `az network lb address-pool show --lb-name "${v.lb}" --name "${v.pool}" --resource-group "${v.rg}" --output json`,
        },
        {
          title: 'LB Health Probes',
          description: 'Show all health probe configurations for a load balancer.',
          fields: [
            { key: 'rg', label: 'Resource Group', default: rg },
            { key: 'lb', label: 'LB Name',        placeholder: 'lb-spoke-internal' },
          ],
          buildCmd: (v) => `az network lb probe list --lb-name "${v.lb}" --resource-group "${v.rg}" --output table`,
        },
        {
          title: 'LB Rules',
          description: 'List all load balancing rules defined on a load balancer.',
          fields: [
            { key: 'rg', label: 'Resource Group', default: rg },
            { key: 'lb', label: 'LB Name',        placeholder: 'lb-spoke-internal' },
          ],
          buildCmd: (v) => `az network lb rule list --lb-name "${v.lb}" --resource-group "${v.rg}" --output table`,
        },
        {
          title: 'List Front Door Profiles',
          description: 'List all Azure Front Door Standard/Premium profiles.',
          fields: [
            { key: 'rg', label: 'Resource Group', default: rg },
          ],
          buildCmd: (v) => `az afd profile list --resource-group "${v.rg}" --output table`,
        },
        {
          title: 'Front Door Origins',
          description: 'List all origin groups and origins in a Front Door profile.',
          fields: [
            { key: 'rg',      label: 'Resource Group', default: rg },
            { key: 'profile', label: 'Profile Name',   placeholder: 'afd-profile' },
            { key: 'og',      label: 'Origin Group',   placeholder: 'origin-group-01' },
          ],
          buildCmd: (v) => `az afd origin list --profile-name "${v.profile}" --origin-group-name "${v.og}" --resource-group "${v.rg}" --output table`,
        },
      ],
    },

    {
      section: 'Firewall & Security',
      cards: [
        {
          title: 'Azure Firewall Status',
          description: 'Show Azure Firewall health, SNAT IPs, and configuration.',
          fields: [
            { key: 'rg', label: 'Resource Group', default: rg },
            { key: 'fw', label: 'Firewall Name',  default: fwName, placeholder: 'afw-hub' },
          ],
          buildCmd: (v) => `az network firewall show --name "${v.fw}" --resource-group "${v.rg}" --output json`,
        },
        {
          title: 'Firewall Policy Rules',
          description: 'List all rule collection groups in a Firewall Policy.',
          fields: [
            { key: 'rg',     label: 'Resource Group', default: rg },
            { key: 'policy', label: 'Policy Name',    default: fwPol, placeholder: 'afwp-hub' },
          ],
          buildCmd: (v) => `az network firewall policy rule-collection-group list --policy-name "${v.policy}" --resource-group "${v.rg}" --output table`,
        },
        {
          title: 'List WAF Policies',
          description: 'List Web Application Firewall (WAF) policies in a resource group.',
          fields: [
            { key: 'rg', label: 'Resource Group', default: rg },
          ],
          buildCmd: (v) => `az network application-gateway waf-policy list --resource-group "${v.rg}" --output table`,
        },
        {
          title: 'DDoS Protection Plans',
          description: 'List DDoS Network Protection plans in the subscription.',
          fields: [],
          buildCmd: () => `az network ddos-protection list --output table`,
        },
        {
          title: 'Private Link Services',
          description: 'List all Private Link services in a resource group.',
          fields: [
            { key: 'rg', label: 'Resource Group', default: rg },
          ],
          buildCmd: (v) => `az network private-link-service list --resource-group "${v.rg}" --output table`,
        },
      ],
    },

    {
      section: 'DNS & Private Endpoints',
      cards: [
        {
          title: 'List Private DNS Zones',
          description: 'List all Private DNS zones in a resource group.',
          fields: [
            { key: 'rg', label: 'Resource Group', default: rg },
          ],
          buildCmd: (v) => `az network private-dns zone list --resource-group "${v.rg}" --output table`,
        },
        {
          title: 'DNS Zone Records',
          description: 'List all record sets in a Private DNS zone.',
          fields: [
            { key: 'rg',   label: 'Resource Group', default: rg },
            { key: 'zone', label: 'Zone Name',      placeholder: 'privatelink.blob.core.windows.net' },
          ],
          buildCmd: (v) => `az network private-dns record-set list --zone-name "${v.zone}" --resource-group "${v.rg}" --output table`,
        },
        {
          title: 'List Private Endpoints',
          description: 'List all Private Endpoints and their connection states.',
          fields: [
            { key: 'rg', label: 'Resource Group', default: rg },
          ],
          buildCmd: (v) => `az network private-endpoint list --resource-group "${v.rg}" --output table`,
        },
        {
          title: 'DNS Lookup',
          description: 'Resolve a hostname to its IP (uses PowerShell Resolve-DnsName).',
          fields: [
            { key: 'hostname', label: 'Hostname', placeholder: 'myapp.blob.core.windows.net' },
          ],
          buildCmd: (v) => `Resolve-DnsName -Name "${v.hostname}" | Format-Table`,
        },
        {
          title: 'Port Connectivity Test',
          description: 'Test TCP port connectivity using PowerShell Test-NetConnection.',
          fields: [
            { key: 'host', label: 'Host / IP',   placeholder: '10.220.1.4' },
            { key: 'port', label: 'TCP Port',    placeholder: '443' },
          ],
          buildCmd: (v) => `Test-NetConnection -ComputerName "${v.host}" -Port ${v.port} -InformationLevel Detailed`,
        },
        {
          title: 'DNS VNet Links',
          description: 'List VNet links for a Private DNS zone.',
          fields: [
            { key: 'rg',   label: 'Resource Group', default: rg },
            { key: 'zone', label: 'Zone Name',      placeholder: 'privatelink.blob.core.windows.net' },
          ],
          buildCmd: (v) => `az network private-dns link vnet list --zone-name "${v.zone}" --resource-group "${v.rg}" --output table`,
        },
      ],
    },

    {
      section: 'Subscription & Resources',
      cards: [
        {
          title: 'List Resource Groups',
          description: 'List all resource groups in the active subscription.',
          fields: [],
          buildCmd: () => `az group list --output table`,
        },
        {
          title: 'Network Resources Overview',
          description: 'List all Microsoft.Network resources in a resource group.',
          fields: [
            { key: 'rg', label: 'Resource Group', default: rg },
          ],
          buildCmd: (v) => `az resource list --resource-group "${v.rg}" --namespace "Microsoft.Network" --output table`,
        },
        {
          title: 'Network Quota Usage',
          description: 'Show network quota limits and current usage for a region.',
          fields: [
            { key: 'location', label: 'Location', default: loc, placeholder: 'eastus' },
          ],
          buildCmd: (v) => `az network list-usages --location "${v.location}" --output table`,
        },
        {
          title: 'Available VM Sizes (Network)',
          description: 'List VM sizes available in a region for planning NIC counts.',
          fields: [
            { key: 'location', label: 'Location', default: loc },
            { key: 'filter',   label: 'Name Filter (optional)', placeholder: 'Standard_D' },
          ],
          buildCmd: (v) => v.filter
            ? `az vm list-sizes --location "${v.location}" --query "[?contains(name, '${v.filter}')]" --output table`
            : `az vm list-sizes --location "${v.location}" --output table`,
        },
        {
          title: 'Deployment What-If',
          description: 'Run az deployment group what-if using current Bicep template from the Builder.',
          fields: [
            { key: 'rg',   label: 'Resource Group', default: rg },
            { key: 'tmpl', label: 'Bicep File Path', placeholder: 'C:\\hub-spoke-vpn.bicep' },
            { key: 'param', label: 'Param File Path', placeholder: 'C:\\hub-spoke-vpn.bicepparam' },
          ],
          buildCmd: (v) => `az deployment group what-if --resource-group "${v.rg}" --template-file "${v.tmpl}" --parameters "@${v.param}"`,
        },
      ],
    },
  ]
}

// ── Main component ───────────────────────────────────────────────────────────

export default function DiagnosticsPanel({ state, onRun, isRunning }) {
  const isElectron = !!window.electronAPI
  const tools = buildTools(state)

  return (
    <div className="diag-panel">
      {!isElectron && (
        <div className="diag-notice">
          Diagnostics require the desktop app (Electron). In browser mode the forms are read-only.
        </div>
      )}

      {tools.map(({ section, cards }) => (
        <div key={section} className="diag-section">
          <div className="diag-section-title">{section}</div>
          <div className="diag-grid">
            {cards.map((card) => (
              <DiagCard
                key={card.title}
                title={card.title}
                description={card.description}
                fields={card.fields}
                buildCmd={card.buildCmd}
                onRun={isElectron ? onRun : () => {}}
                isRunning={isRunning || !isElectron}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

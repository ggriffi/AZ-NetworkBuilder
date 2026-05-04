export function prepareData(state) {
  return {
    ...state,
    onPremPrefixes: state.onPremPrefixes
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    loadBalancers: state.loadBalancers.filter((lb) => lb.name.trim()),
  };
}

// ── PS1 builder ───────────────────────────────────────────────────────────────

export function buildPS1(d) {
  const isAZ = d.gwSku.endsWith('AZ');
  const prefixArg = `@(${d.onPremPrefixes.map((p) => `"${p}"`).join(', ')})`;

  const spokePairs = [];
  for (let i = 0; i < d.spokes.length; i++)
    for (let j = i + 1; j < d.spokes.length; j++)
      spokePairs.push([d.spokes[i].name, d.spokes[j].name]);

  const deleteBlock = d.oldRg
    ? `# ------------------------------
# Delete old resource group
# ------------------------------
Write-Host "Deleting old resource group: $OldRG" -ForegroundColor Yellow
az group delete --name $OldRG --yes --no-wait

`
    : '';

  const spokeVars = d.spokes
    .map(
      (s, i) =>
        `$Spoke${i + 1}              = "${s.name}"
$Spoke${i + 1}Prefix         = "${s.addr}"
$Spoke${i + 1}SubnetName     = "Workloads"
$Spoke${i + 1}SubnetPrefix   = "${s.sub}"`
    )
    .join('\n\n');

  const createSpokes = d.spokes
    .map(
      (s, i) =>
        `az network vnet create \`
  --resource-group $RG \`
  --name $Spoke${i + 1} \`
  --location $Location \`
  --address-prefix $Spoke${i + 1}Prefix \`
  --subnet-name $Spoke${i + 1}SubnetName \`
  --subnet-prefix $Spoke${i + 1}SubnetPrefix`
    )
    .join('\n\n');

  const spokesArr = d.spokes.map((s) => `"${s.name}"`).join(', ');
  const pairsArr = spokePairs.map(([a, b]) => `  @("${a}", "${b}")`).join(',\n');
  const zonesLine = isAZ ? `\n  --zone 1 2 3` : '';

  // ── NSGs ──────────────────────────────────────────────────────────────────
  const nsgBlock = d.nsgPerSpoke
    ? `
# ------------------------------
# NSGs (one per spoke)
# ------------------------------
Write-Host "Creating NSGs for spoke subnets..." -ForegroundColor Cyan
foreach ($Spoke in $Spokes) {
  $NsgName = "nsg-$Spoke"
  az network nsg create \`
    --resource-group $RG \`
    --name $NsgName \`
    --location $Location

  az network nsg rule create \`
    --resource-group $RG --nsg-name $NsgName \`
    --name Allow-VNet-Inbound --priority 100 \`
    --direction Inbound --access Allow --protocol "*" \`
    --source-address-prefixes VirtualNetwork \`
    --destination-address-prefixes VirtualNetwork \`
    --source-port-ranges "*" --destination-port-ranges "*"

  az network nsg rule create \`
    --resource-group $RG --nsg-name $NsgName \`
    --name Allow-LB-Inbound --priority 200 \`
    --direction Inbound --access Allow --protocol "*" \`
    --source-address-prefixes AzureLoadBalancer \`
    --destination-address-prefixes "*" \`
    --source-port-ranges "*" --destination-port-ranges "*"

  az network nsg rule create \`
    --resource-group $RG --nsg-name $NsgName \`
    --name Deny-All-Inbound --priority 4096 \`
    --direction Inbound --access Deny --protocol "*" \`
    --source-address-prefixes "*" --destination-address-prefixes "*" \`
    --source-port-ranges "*" --destination-port-ranges "*"

  az network vnet subnet update \`
    --resource-group $RG \`
    --vnet-name $Spoke \`
    --name Workloads \`
    --network-security-group $NsgName
}
`
    : '';

  // ── Firewall ──────────────────────────────────────────────────────────────
  const fwBlock = d.firewall.enabled
    ? `
# ------------------------------
# Azure Firewall
# ------------------------------
Write-Host "Creating AzureFirewallSubnet..." -ForegroundColor Cyan
az network vnet subnet create \`
  --resource-group $RG \`
  --vnet-name $HubVNet \`
  --name AzureFirewallSubnet \`
  --address-prefix "${d.firewall.subnetPrefix}"

Write-Host "Creating Firewall public IP..." -ForegroundColor Cyan
az network public-ip create \`
  --resource-group $RG \`
  --name "${d.firewall.pipName}" \`
  --location $Location \`
  --sku Standard \`
  --allocation-method Static \`
  --zone 1 2 3

Write-Host "Creating Firewall Policy..." -ForegroundColor Cyan
az network firewall policy create \`
  --resource-group $RG \`
  --name "${d.firewall.policyName}" \`
  --location $Location \`
  --sku ${d.firewall.sku}

Write-Host "Creating Azure Firewall (takes ~5 min)..." -ForegroundColor Yellow
az network firewall create \`
  --resource-group $RG \`
  --name "${d.firewall.name}" \`
  --location $Location \`
  --vnet-name $HubVNet \`
  --sku AZFW_VNet \`
  --tier ${d.firewall.sku} \`
  --firewall-policy "${d.firewall.policyName}"

az network firewall ip-config create \`
  --resource-group $RG \`
  --firewall-name "${d.firewall.name}" \`
  --name FwIpConfig \`
  --public-ip-address "${d.firewall.pipName}" \`
  --vnet-name $HubVNet
${
  d.firewall.forceRoute
    ? `
$FwPrivateIp = (az network firewall show \`
  --resource-group $RG \`
  --name "${d.firewall.name}" \`
  --query "ipConfigurations[0].privateIPAddress" -o tsv)

Write-Host "Creating spoke UDR (force-route through firewall)..." -ForegroundColor Cyan
az network route-table create \`
  --resource-group $RG \`
  --name rt-spoke-to-hub \`
  --location $Location

az network route-table route create \`
  --resource-group $RG \`
  --route-table-name rt-spoke-to-hub \`
  --name default-to-firewall \`
  --address-prefix 0.0.0.0/0 \`
  --next-hop-type VirtualAppliance \`
  --next-hop-ip-address $FwPrivateIp

foreach ($Spoke in $Spokes) {
  az network vnet subnet update \`
    --resource-group $RG \`
    --vnet-name $Spoke \`
    --name Workloads \`
    --route-table rt-spoke-to-hub
}
`
    : ''
}
`
    : '';

  // ── Load Balancers ────────────────────────────────────────────────────────
  const lbBlock =
    d.loadBalancers.length > 0
      ? `
# ------------------------------
# Load Balancers
# ------------------------------
` +
        d.loadBalancers
          .map((lb) => {
            if (lb.type === 'External') {
              return `Write-Host "Creating external LB: ${lb.name}..." -ForegroundColor Cyan
az network public-ip create \`
  --resource-group $RG \`
  --name "pip-${lb.name}" \`
  --location $Location \`
  --sku ${lb.sku} \`
  --allocation-method Static

az network lb create \`
  --resource-group $RG \`
  --name "${lb.name}" \`
  --location $Location \`
  --sku ${lb.sku} \`
  --public-ip-address "pip-${lb.name}" \`
  --frontend-ip-name frontend \`
  --backend-pool-name backend

az network lb probe create \`
  --resource-group $RG \`
  --lb-name "${lb.name}" \`
  --name healthprobe \`
  --protocol ${lb.protocol} \`
  --port ${lb.probePort}

az network lb rule create \`
  --resource-group $RG \`
  --lb-name "${lb.name}" \`
  --name "lbrule-${lb.port}" \`
  --protocol ${lb.protocol} \`
  --frontend-port ${lb.port} \`
  --backend-port ${lb.port} \`
  --frontend-ip-name frontend \`
  --backend-pool-name backend \`
  --probe-name healthprobe`;
            } else {
              const ipAlloc = lb.frontendIp ? 'Static' : 'Dynamic';
              const ipLine = lb.frontendIp
                ? `\n  --private-ip-address "${lb.frontendIp}" \``
                : '';
              return `Write-Host "Creating internal LB: ${lb.name}..." -ForegroundColor Cyan
az network lb create \`
  --resource-group $RG \`
  --name "${lb.name}" \`
  --location $Location \`
  --sku ${lb.sku} \`
  --vnet-name "${lb.spoke}" \`
  --subnet Workloads \`
  --private-ip-address-allocation ${ipAlloc}${ipLine}
  --frontend-ip-name frontend \`
  --backend-pool-name backend

az network lb probe create \`
  --resource-group $RG \`
  --lb-name "${lb.name}" \`
  --name healthprobe \`
  --protocol ${lb.protocol} \`
  --port ${lb.probePort}

az network lb rule create \`
  --resource-group $RG \`
  --lb-name "${lb.name}" \`
  --name "lbrule-${lb.port}" \`
  --protocol ${lb.protocol} \`
  --frontend-port ${lb.port} \`
  --backend-port ${lb.port} \`
  --frontend-ip-name frontend \`
  --backend-pool-name backend \`
  --probe-name healthprobe`;
            }
          })
          .join('\n\n')
      : '';

  // ── Front Door ────────────────────────────────────────────────────────────
  const afdBlock = d.frontDoor.enabled
    ? `
# ------------------------------
# Azure Front Door
# ------------------------------
Write-Host "Creating Front Door profile..." -ForegroundColor Cyan
az afd profile create \`
  --resource-group $RG \`
  --profile-name "${d.frontDoor.profileName}" \`
  --sku ${d.frontDoor.sku}

az afd endpoint create \`
  --resource-group $RG \`
  --profile-name "${d.frontDoor.profileName}" \`
  --endpoint-name "${d.frontDoor.endpointName}"

az afd origin-group create \`
  --resource-group $RG \`
  --profile-name "${d.frontDoor.profileName}" \`
  --origin-group-name og-default \`
  --probe-request-type GET \`
  --probe-protocol Http \`
  --probe-interval-in-seconds 30 \`
  --probe-path /

az afd origin create \`
  --resource-group $RG \`
  --profile-name "${d.frontDoor.profileName}" \`
  --origin-group-name og-default \`
  --origin-name origin1 \`
  --host-name "${d.frontDoor.originHostname}" \`
  --origin-host-header "${d.frontDoor.originHostname}" \`
  --http-port 80 \`
  --https-port 443 \`
  --priority 1 \`
  --weight 1000

az afd route create \`
  --resource-group $RG \`
  --profile-name "${d.frontDoor.profileName}" \`
  --endpoint-name "${d.frontDoor.endpointName}" \`
  --route-name route-default \`
  --origin-group og-default \`
  --supported-protocols Http Https \`
  --https-redirect Enabled \`
  --forwarding-protocol MatchRequest
${
  d.frontDoor.wafEnabled
    ? `
az network front-door waf-policy create \`
  --resource-group $RG \`
  --name "${d.frontDoor.wafPolicyName}" \`
  --mode Prevention \`
  --sku ${d.frontDoor.sku}
`
    : ''
}
`
    : '';

  return `# ==============================
# Azure Hub-Spoke + S2S VPN
# Generated ${new Date().toLocaleDateString()}
# ==============================

$ErrorActionPreference = "Stop"

${d.oldRg ? `$OldRG = "${d.oldRg}"\n` : ''}$RG       = "${d.rg}"
$Location = "${d.location}"

# Hub
$HubVNet            = "${d.hubName}"
$HubPrefix          = "${d.hubPrefix}"
$HubSubnet          = "${d.hubSubnetName}"
$HubSubnetPrefix    = "${d.hubSubnetPrefix}"
$GatewaySubnetPrefix = "${d.gwPrefix}"

# Spokes
${spokeVars}

# VPN
$VpnPip       = "${d.pipName}"
$VpnGateway   = "${d.gwName}"
$LocalGateway = "${d.lngName}"
$Connection   = "${d.connName}"

$HomePublicIp = "${d.onPremIp}"
$HomePrefixes = ${prefixArg}

$Psk = Read-Host "Enter VPN PSK"

${deleteBlock}# ------------------------------
# Resource group
# ------------------------------
Write-Host "Creating resource group: $RG" -ForegroundColor Cyan
az group create \`
  --name $RG \`
  --location $Location

# ------------------------------
# Hub VNet
# ------------------------------
Write-Host "Creating hub VNet..." -ForegroundColor Cyan
az network vnet create \`
  --resource-group $RG \`
  --name $HubVNet \`
  --location $Location \`
  --address-prefix $HubPrefix \`
  --subnet-name $HubSubnet \`
  --subnet-prefix $HubSubnetPrefix

az network vnet subnet create \`
  --resource-group $RG \`
  --vnet-name $HubVNet \`
  --name GatewaySubnet \`
  --address-prefix $GatewaySubnetPrefix

# ------------------------------
# Spoke VNets
# ------------------------------
Write-Host "Creating spoke VNets..." -ForegroundColor Cyan

${createSpokes}

# Collect spoke names array for loops
$Spokes = @(${spokesArr})
${nsgBlock}${fwBlock}
# ------------------------------
# VPN Gateway
# ------------------------------
Write-Host "Creating VPN Gateway public IP..." -ForegroundColor Cyan
az network public-ip create \`
  --resource-group $RG \`
  --name $VpnPip \`
  --location $Location \`
  --sku Standard \`
  --allocation-method Static${zonesLine}

Write-Host "Creating VPN Gateway (this takes ~30 min)..." -ForegroundColor Yellow
az network vnet-gateway create \`
  --resource-group $RG \`
  --name $VpnGateway \`
  --location $Location \`
  --public-ip-address $VpnPip \`
  --vnet $HubVNet \`
  --gateway-type Vpn \`
  --vpn-type RouteBased \`
  --sku ${d.gwSku} \`
  --no-wait

az network vnet-gateway wait \`
  --resource-group $RG \`
  --name $VpnGateway \`
  --created

# ------------------------------
# Hub-Spoke peerings
# ------------------------------
Write-Host "Creating hub-spoke peerings..." -ForegroundColor Cyan

foreach ($Spoke in $Spokes) {
  az network vnet peering create \`
    --resource-group $RG \`
    --vnet-name $HubVNet \`
    --name "peer-$HubVNet-to-$Spoke" \`
    --remote-vnet $Spoke \`
    --allow-vnet-access \`
    --allow-forwarded-traffic \`
    --allow-gateway-transit

  az network vnet peering create \`
    --resource-group $RG \`
    --vnet-name $Spoke \`
    --name "peer-$Spoke-to-$HubVNet" \`
    --remote-vnet $HubVNet \`
    --allow-vnet-access \`
    --allow-forwarded-traffic \`
    --use-remote-gateways
}

# ------------------------------
# Spoke-to-spoke peerings
# ------------------------------
Write-Host "Creating spoke-to-spoke peerings..." -ForegroundColor Cyan
$SpokePairs = @(
${pairsArr}
)

foreach ($Pair in $SpokePairs) {
  $A = $Pair[0]; $B = $Pair[1]
  az network vnet peering create \`
    --resource-group $RG --vnet-name $A \`
    --name "peer-$A-to-$B" --remote-vnet $B \`
    --allow-vnet-access --allow-forwarded-traffic
  az network vnet peering create \`
    --resource-group $RG --vnet-name $B \`
    --name "peer-$B-to-$A" --remote-vnet $A \`
    --allow-vnet-access --allow-forwarded-traffic
}

# ------------------------------
# Local Network Gateway
# ------------------------------
Write-Host "Creating local network gateway..." -ForegroundColor Cyan
az network local-gateway create \`
  --resource-group $RG \`
  --name $LocalGateway \`
  --location $Location \`
  --gateway-ip-address $HomePublicIp \`
  --local-address-prefixes $HomePrefixes

# ------------------------------
# VPN Connection + IPsec Policy
# ------------------------------
Write-Host "Creating VPN connection..." -ForegroundColor Cyan
az network vpn-connection create \`
  --resource-group $RG \`
  --name $Connection \`
  --location $Location \`
  --vnet-gateway1 $VpnGateway \`
  --local-gateway2 $LocalGateway \`
  --connection-type IPsec \`
  --shared-key $Psk

az network vpn-connection ipsec-policy add \`
  --resource-group $RG \`
  --connection-name $Connection \`
  --dh-group ${d.dhGroup} \`
  --ike-encryption ${d.ikeEnc} \`
  --ike-integrity ${d.ikeInt} \`
  --ipsec-encryption ${d.ipsecEnc} \`
  --ipsec-integrity ${d.ipsecInt} \`
  --pfs-group ${d.pfsGroup} \`
  --sa-lifetime ${d.saLifetime} \`
  --sa-data-size 0
${lbBlock}${afdBlock}
# ------------------------------
# Summary
# ------------------------------
Write-Host "Deployment complete." -ForegroundColor Green

az network public-ip show \`
  --resource-group $RG --name $VpnPip \`
  --query "{vpnGatewayPublicIp:ipAddress}" -o table

az network vpn-connection show \`
  --resource-group $RG --name $Connection \`
  --query "{name:name,status:connectionStatus}" -o table

az network vnet list \`
  --resource-group $RG \`
  --query "[].{name:name,address:addressSpace.addressPrefixes}" -o table
`;
}

// ── Bicep builder ─────────────────────────────────────────────────────────────

export function buildBicep(d) {
  const isAZ = d.gwSku.endsWith('AZ');
  const zonesLine = isAZ ? "\n  zones: ['1', '2', '3']" : '';
  const S = '\x24{';
  const E = '}';

  // ── Hub VNet subnets (conditionally include AzureFirewallSubnet) ──────────
  const hubSubnets = [
    `{ name: '${d.hubSubnetName}', properties: { addressPrefix: hubSubnetPrefix } }`,
    `{ name: 'GatewaySubnet', properties: { addressPrefix: gatewaySubnetPrefix } }`,
    ...(d.firewall.enabled
      ? [`{ name: 'AzureFirewallSubnet', properties: { addressPrefix: '${d.firewall.subnetPrefix}' } }`]
      : []),
  ].join('\n      ');

  // ── Spoke-to-spoke peerings ───────────────────────────────────────────────
  const spokePeerLines = [];
  for (let bi = 0; bi < d.spokes.length; bi++) {
    for (let bj = bi + 1; bj < d.spokes.length; bj++) {
      spokePeerLines.push(
        `resource s2s_${bi}_${bj}_ab 'Microsoft.Network/virtualNetworks/virtualNetworkPeerings@2023-11-01' = {
  parent: spokeVNets[${bi}]
  name: 'peer-${S}spokes[${bi}].name${E}-to-${S}spokes[${bj}].name${E}'
  properties: {
    remoteVirtualNetwork: { id: spokeVNets[${bj}].id }
    allowVirtualNetworkAccess: true
    allowForwardedTraffic: true
  }
  dependsOn: [spokeVNets]
}

resource s2s_${bi}_${bj}_ba 'Microsoft.Network/virtualNetworks/virtualNetworkPeerings@2023-11-01' = {
  parent: spokeVNets[${bj}]
  name: 'peer-${S}spokes[${bj}].name${E}-to-${S}spokes[${bi}].name${E}'
  properties: {
    remoteVirtualNetwork: { id: spokeVNets[${bi}].id }
    allowVirtualNetworkAccess: true
    allowForwardedTraffic: true
  }
  dependsOn: [spokeVNets]
}`
      );
    }
  }
  const spokePeerBlock =
    spokePeerLines.length > 0
      ? '// ── Spoke-to-spoke full mesh ─────────────────────────────────────────────────\n\n' +
        spokePeerLines.join('\n\n')
      : '// No spoke-to-spoke peerings (fewer than 2 spokes)';

  // ── NSG resources ─────────────────────────────────────────────────────────
  const nsgResources = d.nsgPerSpoke
    ? `
// ── Spoke NSGs ───────────────────────────────────────────────────────────────

resource spokeNsgs 'Microsoft.Network/networkSecurityGroups@2023-11-01' = [for spoke in spokes: {
  name: 'nsg-${S}spoke.name${E}'
  location: location
  properties: {
    securityRules: [
      {
        name: 'Allow-VNet-Inbound'
        properties: {
          priority: 100
          direction: 'Inbound'
          access: 'Allow'
          protocol: '*'
          sourceAddressPrefix: 'VirtualNetwork'
          destinationAddressPrefix: 'VirtualNetwork'
          sourcePortRange: '*'
          destinationPortRange: '*'
        }
      }
      {
        name: 'Allow-LB-Inbound'
        properties: {
          priority: 200
          direction: 'Inbound'
          access: 'Allow'
          protocol: '*'
          sourceAddressPrefix: 'AzureLoadBalancer'
          destinationAddressPrefix: '*'
          sourcePortRange: '*'
          destinationPortRange: '*'
        }
      }
      {
        name: 'Deny-All-Inbound'
        properties: {
          priority: 4096
          direction: 'Inbound'
          access: 'Deny'
          protocol: '*'
          sourceAddressPrefix: '*'
          destinationAddressPrefix: '*'
          sourcePortRange: '*'
          destinationPortRange: '*'
        }
      }
    ]
  }
}]
`
    : '';

  const spokeNsgRef = d.nsgPerSpoke
    ? `\n          networkSecurityGroup: { id: spokeNsgs[i].id }`
    : '';
  const spokeNsgDepends = d.nsgPerSpoke ? `\n  dependsOn: [spokeNsgs[i]]` : '';

  // ── Firewall resources ────────────────────────────────────────────────────
  const fwResources = d.firewall.enabled
    ? `
// ── Azure Firewall ────────────────────────────────────────────────────────────

resource fwPip 'Microsoft.Network/publicIPAddresses@2023-11-01' = {
  name: '${d.firewall.pipName}'
  location: location
  sku: { name: 'Standard', tier: 'Regional' }
  zones: ['1', '2', '3']
  properties: { publicIPAllocationMethod: 'Static' }
}

resource fwPolicy 'Microsoft.Network/firewallPolicies@2023-11-01' = {
  name: '${d.firewall.policyName}'
  location: location
  properties: {
    sku: { tier: '${d.firewall.sku}' }
    threatIntelMode: 'Alert'
  }
}

resource firewall 'Microsoft.Network/azureFirewalls@2023-11-01' = {
  name: '${d.firewall.name}'
  location: location
  zones: ['1', '2', '3']
  properties: {
    sku: { name: 'AZFW_VNet', tier: '${d.firewall.sku}' }
    firewallPolicy: { id: fwPolicy.id }
    ipConfigurations: [
      {
        name: 'FwIpConfig'
        properties: {
          publicIPAddress: { id: fwPip.id }
          subnet: { id: resourceId('Microsoft.Network/virtualNetworks/subnets', hubVNetName, 'AzureFirewallSubnet') }
        }
      }
    ]
  }
  dependsOn: [hubVNet]
}
${
  d.firewall.forceRoute
    ? `
resource spokRouteTable 'Microsoft.Network/routeTables@2023-11-01' = {
  name: 'rt-spoke-to-hub'
  location: location
  properties: {
    routes: [
      {
        name: 'default-to-firewall'
        properties: {
          addressPrefix: '0.0.0.0/0'
          nextHopType: 'VirtualAppliance'
          nextHopIpAddress: firewall.properties.ipConfigurations[0].properties.privateIPAddress
        }
      }
    ]
  }
}
`
    : ''
}
`
    : '';

  // ── Load Balancer resources ───────────────────────────────────────────────
  const lbResources =
    d.loadBalancers.length > 0
      ? `
// ── Load Balancers ────────────────────────────────────────────────────────────

` +
        d.loadBalancers
          .map((lb) => {
            if (lb.type === 'External') {
              return `resource pip_${lb.name.replace(/\W/g, '_')} 'Microsoft.Network/publicIPAddresses@2023-11-01' = {
  name: 'pip-${lb.name}'
  location: location
  sku: { name: '${lb.sku}', tier: 'Regional' }
  properties: { publicIPAllocationMethod: 'Static' }
}

resource lb_${lb.name.replace(/\W/g, '_')} 'Microsoft.Network/loadBalancers@2023-11-01' = {
  name: '${lb.name}'
  location: location
  sku: { name: '${lb.sku}' }
  properties: {
    frontendIPConfigurations: [
      {
        name: 'frontend'
        properties: { publicIPAddress: { id: pip_${lb.name.replace(/\W/g, '_')}.id } }
      }
    ]
    backendAddressPools: [{ name: 'backend' }]
    probes: [
      { name: 'healthprobe', properties: { protocol: '${lb.protocol}', port: ${lb.probePort}, intervalInSeconds: 15, numberOfProbes: 2 } }
    ]
    loadBalancingRules: [
      {
        name: 'lbrule-${lb.port}'
        properties: {
          frontendIPConfiguration: { id: resourceId('Microsoft.Network/loadBalancers/frontendIPConfigurations', '${lb.name}', 'frontend') }
          backendAddressPool: { id: resourceId('Microsoft.Network/loadBalancers/backendAddressPools', '${lb.name}', 'backend') }
          probe: { id: resourceId('Microsoft.Network/loadBalancers/probes', '${lb.name}', 'healthprobe') }
          protocol: '${lb.protocol}'
          frontendPort: ${lb.port}
          backendPort: ${lb.port}
          enableFloatingIP: false
        }
      }
    ]
  }
}`;
            } else {
              const ipProps = lb.frontendIp
                ? `privateIPAddress: '${lb.frontendIp}'\n          privateIPAllocationMethod: 'Static'`
                : `privateIPAllocationMethod: 'Dynamic'`;
              return `resource lb_${lb.name.replace(/\W/g, '_')} 'Microsoft.Network/loadBalancers@2023-11-01' = {
  name: '${lb.name}'
  location: location
  sku: { name: '${lb.sku}' }
  dependsOn: [spokeVNets]
  properties: {
    frontendIPConfigurations: [
      {
        name: 'frontend'
        properties: {
          subnet: { id: resourceId('Microsoft.Network/virtualNetworks/subnets', '${lb.spoke}', 'Workloads') }
          ${ipProps}
        }
      }
    ]
    backendAddressPools: [{ name: 'backend' }]
    probes: [
      { name: 'healthprobe', properties: { protocol: '${lb.protocol}', port: ${lb.probePort}, intervalInSeconds: 15, numberOfProbes: 2 } }
    ]
    loadBalancingRules: [
      {
        name: 'lbrule-${lb.port}'
        properties: {
          frontendIPConfiguration: { id: resourceId('Microsoft.Network/loadBalancers/frontendIPConfigurations', '${lb.name}', 'frontend') }
          backendAddressPool: { id: resourceId('Microsoft.Network/loadBalancers/backendAddressPools', '${lb.name}', 'backend') }
          probe: { id: resourceId('Microsoft.Network/loadBalancers/probes', '${lb.name}', 'healthprobe') }
          protocol: '${lb.protocol}'
          frontendPort: ${lb.port}
          backendPort: ${lb.port}
          enableFloatingIP: false
        }
      }
    ]
  }
}`;
            }
          })
          .join('\n\n')
      : '';

  // ── Front Door resources ──────────────────────────────────────────────────
  const afdResources = d.frontDoor.enabled
    ? `
// ── Azure Front Door ──────────────────────────────────────────────────────────

resource afdProfile 'Microsoft.Cdn/profiles@2023-05-01' = {
  name: '${d.frontDoor.profileName}'
  location: 'global'
  sku: { name: '${d.frontDoor.sku}' }
}

resource afdEndpoint 'Microsoft.Cdn/profiles/afdEndpoints@2023-05-01' = {
  parent: afdProfile
  name: '${d.frontDoor.endpointName}'
  location: 'global'
}

resource afdOriginGroup 'Microsoft.Cdn/profiles/originGroups@2023-05-01' = {
  parent: afdProfile
  name: 'og-default'
  properties: {
    loadBalancingSettings: { sampleSize: 4, successfulSamplesRequired: 3 }
    healthProbeSettings: {
      probePath: '/'
      probeRequestType: 'GET'
      probeProtocol: 'Http'
      probeIntervalInSeconds: 30
    }
  }
}

resource afdOrigin 'Microsoft.Cdn/profiles/originGroups/origins@2023-05-01' = {
  parent: afdOriginGroup
  name: 'origin1'
  properties: {
    hostName: '${d.frontDoor.originHostname}'
    httpPort: 80
    httpsPort: 443
    originHostHeader: '${d.frontDoor.originHostname}'
    priority: 1
    weight: 1000
  }
}

resource afdRoute 'Microsoft.Cdn/profiles/afdEndpoints/routes@2023-05-01' = {
  parent: afdEndpoint
  name: 'route-default'
  properties: {
    originGroup: { id: afdOriginGroup.id }
    supportedProtocols: ['Http', 'Https']
    patternsToMatch: ['/*']
    forwardingProtocol: 'MatchRequest'
    httpsRedirect: 'Enabled'
  }
  dependsOn: [afdOrigin]
}
${
  d.frontDoor.wafEnabled
    ? `
resource wafPolicy 'Microsoft.Network/frontDoorWebApplicationFirewallPolicies@2022-05-01' = {
  name: '${d.frontDoor.wafPolicyName}'
  location: 'global'
  sku: { name: '${d.frontDoor.sku}' }
  properties: {
    policySettings: { mode: 'Prevention', enabledState: 'Enabled' }
    managedRules: {
      managedRuleSets: [
        { ruleSetType: 'Microsoft_DefaultRuleSet', ruleSetVersion: '2.1' }
        { ruleSetType: 'Microsoft_BotManagerRuleSet', ruleSetVersion: '1.0' }
      ]
    }
  }
}
`
    : ''
}
`
    : '';

  return `@description('Azure region for all resources.')
param location string = '${d.location}'

@description('Hub VNet name.')
param hubVNetName string

@description('Hub VNet address prefix.')
param hubAddressPrefix string

@description('Hub-Services subnet prefix.')
param hubSubnetPrefix string

@description('GatewaySubnet prefix. Must be /27 or larger.')
param gatewaySubnetPrefix string

@description('Spoke definitions. Each entry: { name, addressPrefix, subnetPrefix }.')
param spokes array

@description('Public IP name for the VPN Gateway.')
param vpnPipName string

@description('VPN Gateway name.')
param vpnGatewayName string

@description('Local Network Gateway name.')
param localGatewayName string

@description('VPN connection name.')
param connectionName string

@description('On-premises device public IP address.')
param onPremPublicIp string

@description('On-premises address prefixes.')
param onPremPrefixes array

@description('VPN pre-shared key.')
@secure()
param psk string

// ── Hub VNet ──────────────────────────────────────────────────────────────────

resource hubVNet 'Microsoft.Network/virtualNetworks@2023-11-01' = {
  name: hubVNetName
  location: location
  properties: {
    addressSpace: { addressPrefixes: [hubAddressPrefix] }
    subnets: [
      ${hubSubnets}
    ]
  }
}

// ── Spoke VNets ───────────────────────────────────────────────────────────────
${nsgResources}
resource spokeVNets 'Microsoft.Network/virtualNetworks@2023-11-01' = [for (spoke, i) in spokes: {
  name: spoke.name
  location: location
  properties: {
    addressSpace: { addressPrefixes: [spoke.addressPrefix] }
    subnets: [
      {
        name: 'Workloads'
        properties: {
          addressPrefix: spoke.subnetPrefix${spokeNsgRef}
        }
      }
    ]
  }${spokeNsgDepends}
}]

// ── VPN Gateway ───────────────────────────────────────────────────────────────

resource vpnPip 'Microsoft.Network/publicIPAddresses@2023-11-01' = {
  name: vpnPipName
  location: location
  sku: { name: 'Standard', tier: 'Regional' }${zonesLine}
  properties: { publicIPAllocationMethod: 'Static' }
}

resource vpnGateway 'Microsoft.Network/virtualNetworkGateways@2023-11-01' = {
  name: vpnGatewayName
  location: location
  properties: {
    ipConfigurations: [
      {
        name: 'gwIpConfig'
        properties: {
          publicIPAddress: { id: vpnPip.id }
          subnet: { id: resourceId('Microsoft.Network/virtualNetworks/subnets', hubVNetName, 'GatewaySubnet') }
        }
      }
    ]
    gatewayType: 'Vpn'
    vpnType: 'RouteBased'
    sku: { name: '${d.gwSku}', tier: '${d.gwSku}' }
  }
  dependsOn: [hubVNet]
}

// ── Hub <-> Spoke peerings ────────────────────────────────────────────────────

resource hubToSpokePeerings 'Microsoft.Network/virtualNetworks/virtualNetworkPeerings@2023-11-01' = [for (spoke, i) in spokes: {
  parent: hubVNet
  name: 'peer-${S}hubVNetName${E}-to-${S}spoke.name${E}'
  properties: {
    remoteVirtualNetwork: { id: spokeVNets[i].id }
    allowVirtualNetworkAccess: true
    allowForwardedTraffic: true
    allowGatewayTransit: true
    useRemoteGateways: false
  }
  dependsOn: [vpnGateway]
}]

resource spokeToHubPeerings 'Microsoft.Network/virtualNetworks/virtualNetworkPeerings@2023-11-01' = [for (spoke, i) in spokes: {
  parent: spokeVNets[i]
  name: 'peer-${S}spoke.name${E}-to-${S}hubVNetName${E}'
  properties: {
    remoteVirtualNetwork: { id: hubVNet.id }
    allowVirtualNetworkAccess: true
    allowForwardedTraffic: true
    allowGatewayTransit: false
    useRemoteGateways: true
  }
  dependsOn: [vpnGateway]
}]

${spokePeerBlock}

// ── Local Network Gateway ─────────────────────────────────────────────────────

resource localGateway 'Microsoft.Network/localNetworkGateways@2023-11-01' = {
  name: localGatewayName
  location: location
  properties: {
    gatewayIpAddress: onPremPublicIp
    localNetworkAddressSpace: { addressPrefixes: onPremPrefixes }
  }
}

// ── VPN Connection ────────────────────────────────────────────────────────────

resource vpnConnection 'Microsoft.Network/connections@2023-11-01' = {
  name: connectionName
  location: location
  properties: {
    connectionType: 'IPsec'
    virtualNetworkGateway1: { id: vpnGateway.id, properties: {} }
    localNetworkGateway2: { id: localGateway.id, properties: {} }
    sharedKey: psk
    ipsecPolicies: [
      {
        dhGroup: '${d.dhGroup}'
        ikeEncryption: '${d.ikeEnc}'
        ikeIntegrity: '${d.ikeInt}'
        ipsecEncryption: '${d.ipsecEnc}'
        ipsecIntegrity: '${d.ipsecInt}'
        pfsGroup: '${d.pfsGroup}'
        saLifeTimeSeconds: ${d.saLifetime}
        saDataSizeKilobytes: 0
      }
    ]
  }
}
${fwResources}${lbResources}${afdResources}
// ── Outputs ───────────────────────────────────────────────────────────────────

output vpnGatewayPublicIp string = vpnPip.properties.ipAddress
output vpnGatewayName string = vpnGateway.name
output hubVNetId string = hubVNet.id
output spokeVNetIds array = [for (spoke, i) in spokes: spokeVNets[i].id]
`;
}

// ── Param file builder ────────────────────────────────────────────────────────

export function buildParam(d) {
  const spokesBlock = d.spokes
    .map(
      (s) =>
        `  {
    name: '${s.name}'
    addressPrefix: '${s.addr}'
    subnetPrefix: '${s.sub}'
  }`
    )
    .join('\n');

  const prefixArr = d.onPremPrefixes.map((p) => `'${p}'`).join(', ');

  return `using './hub-spoke-vpn.bicep'

param location = '${d.location}'

param hubVNetName = '${d.hubName}'
param hubAddressPrefix = '${d.hubPrefix}'
param hubSubnetPrefix = '${d.hubSubnetPrefix}'
param gatewaySubnetPrefix = '${d.gwPrefix}'

param spokes = [
${spokesBlock}
]

param vpnPipName      = '${d.pipName}'
param vpnGatewayName  = '${d.gwName}'
param localGatewayName = '${d.lngName}'
param connectionName  = '${d.connName}'

param onPremPublicIp  = '${d.onPremIp}'
param onPremPrefixes  = [${prefixArr}]

// psk is passed at deploy time — never store it here
`;
}

// ── Deploy script builder ─────────────────────────────────────────────────────

export function buildDeploy(d) {
  const bicepContent = buildBicep(d).trimEnd();
  const rawParam = buildParam(d);
  const paramContent = rawParam.slice(0, rawParam.lastIndexOf('\n// psk')).trimEnd();

  return `#Requires -Version 7.0
# Usage (PowerShell):  pwsh ./Deploy-Network.ps1 -ResourceGroup "my-rg"
# Usage (bash/Linux):  pwsh ./Deploy-Network.ps1 -ResourceGroup "my-rg"
# Do NOT run with bash or sh directly — this is a PowerShell script.
param(
    [Parameter(Mandatory)] [string]$ResourceGroup,
    [string]$Location = '${d.location}'
)

$ErrorActionPreference = 'Stop'

$Psk = Read-Host 'Enter VPN PSK'

Write-Host 'Ensuring Bicep is installed...' -ForegroundColor Cyan
az bicep install

# Write embedded templates to a temp folder
$TempDir   = Join-Path $env:TEMP "hub-spoke-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path $TempDir | Out-Null
$BicepFile = Join-Path $TempDir 'hub-spoke-vpn.bicep'
$ParamFile = Join-Path $TempDir 'hub-spoke-vpn.bicepparam'

Set-Content -Path $BicepFile -Value @'
${bicepContent}
'@

$EscapedPsk = $Psk.Replace("'", "''")
$ParamBody  = @'
${paramContent}
'@
Set-Content -Path $ParamFile -Value ($ParamBody + "\`nparam psk = '$EscapedPsk'")

Write-Host "Ensuring resource group: $ResourceGroup" -ForegroundColor Cyan
az group create --name $ResourceGroup --location $Location | Out-Null

$DeploymentName = "hub-spoke-$(Get-Date -Format 'yyyyMMdd-HHmmss')"

# Optional: preview before deploying (comment out to skip)
Write-Host "\`nRunning what-if preview..." -ForegroundColor Cyan
az deployment group what-if \`
    --resource-group $ResourceGroup \`
    --template-file $BicepFile \`
    --parameters $ParamFile

$Confirm = Read-Host "\`nProceed with deployment? (y/N)"
if ($Confirm -notmatch '^[Yy]') {
    Write-Host 'Deployment cancelled.' -ForegroundColor Yellow
    Remove-Item $TempDir -Recurse -Force -ErrorAction SilentlyContinue
    exit 0
}

Write-Host "Starting deployment: $DeploymentName" -ForegroundColor Yellow

try {
    az deployment group create \`
        --resource-group $ResourceGroup \`
        --template-file $BicepFile \`
        --parameters $ParamFile \`
        --name $DeploymentName

    Write-Host "\`nDeployment outputs:" -ForegroundColor Green
    az deployment group show \`
        --resource-group $ResourceGroup \`
        --name $DeploymentName \`
        --query properties.outputs -o json
} finally {
    Remove-Item $TempDir -Recurse -Force -ErrorAction SilentlyContinue
}
`;
}

// ── Generate all outputs ──────────────────────────────────────────────────────

export function generateAll(state) {
  const d = prepareData(state);
  return {
    ps1: buildPS1(d),
    bicep: buildBicep(d),
    param: buildParam(d),
    deploy: buildDeploy(d),
  };
}

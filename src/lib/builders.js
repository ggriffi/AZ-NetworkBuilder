// Converts raw form state into the data shape the builders expect
export function prepareData(state) {
  return {
    ...state,
    onPremPrefixes: state.onPremPrefixes
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

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
        `$Spoke${i + 1}         = "${s.name}"
$Spoke${i + 1}Prefix  = "${s.addr}"
$Spoke${i + 1}Subnet  = "Workloads"
$Spoke${i + 1}SubnetPrefix = "${s.sub}"`
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
  --subnet-name $Spoke${i + 1}Subnet \`
  --subnet-prefix $Spoke${i + 1}SubnetPrefix`
    )
    .join('\n\n');

  const spokesArr = d.spokes.map((s) => `"${s.name}"`).join(', ');
  const pairsArr = spokePairs.map(([a, b]) => `  @("${a}", "${b}")`).join(',\n');
  const zonesLine = isAZ ? `\n  --zone 1 2 3` : '';

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
$Spokes = @(${spokesArr})

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
# VPN Connection
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

Write-Host "Applying IPsec policy..." -ForegroundColor Cyan
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

export function buildBicep(d) {
  const isAZ = d.gwSku.endsWith('AZ');
  const zonesLine = isAZ ? "\n  zones: ['1', '2', '3']" : '';
  // \x24{ builds "${" so Bicep interpolation syntax is preserved in the JS template literal
  const S = '\x24{';
  const E = '}';

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
}

resource s2s_${bi}_${bj}_ba 'Microsoft.Network/virtualNetworks/virtualNetworkPeerings@2023-11-01' = {
  parent: spokeVNets[${bj}]
  name: 'peer-${S}spokes[${bj}].name${E}-to-${S}spokes[${bi}].name${E}'
  properties: {
    remoteVirtualNetwork: { id: spokeVNets[${bi}].id }
    allowVirtualNetworkAccess: true
    allowForwardedTraffic: true
  }
}`
      );
    }
  }

  const spokePeerBlock =
    spokePeerLines.length > 0
      ? '// ── Spoke-to-spoke full mesh ─────────────────────────────────────────────────\n\n' +
        spokePeerLines.join('\n\n')
      : '// No spoke-to-spoke peerings (fewer than 2 spokes)';

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
      { name: '${d.hubSubnetName}', properties: { addressPrefix: hubSubnetPrefix } }
      { name: 'GatewaySubnet', properties: { addressPrefix: gatewaySubnetPrefix } }
    ]
  }
}

// ── Spoke VNets ───────────────────────────────────────────────────────────────

resource spokeVNets 'Microsoft.Network/virtualNetworks@2023-11-01' = [for spoke in spokes: {
  name: spoke.name
  location: location
  properties: {
    addressSpace: { addressPrefixes: [spoke.addressPrefix] }
    subnets: [
      { name: 'Workloads', properties: { addressPrefix: spoke.subnetPrefix } }
    ]
  }
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

// ── Outputs ───────────────────────────────────────────────────────────────────

output vpnGatewayPublicIp string = vpnPip.properties.ipAddress
output vpnGatewayName string = vpnGateway.name
output hubVNetId string = hubVNet.id
output spokeVNetIds array = [for (spoke, i) in spokes: spokeVNets[i].id]
`;
}

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

export function buildDeploy(d) {
  const bicepContent = buildBicep(d).trimEnd();
  const rawParam = buildParam(d);
  const paramContent = rawParam.slice(0, rawParam.lastIndexOf('\n// psk')).trimEnd();

  return `#Requires -Version 7.0
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
Set-Content -Path $ParamFile -Value ($ParamBody + "param psk = '$EscapedPsk'")

Write-Host "Ensuring resource group: $ResourceGroup" -ForegroundColor Cyan
az group create --name $ResourceGroup --location $Location | Out-Null

$DeploymentName = "hub-spoke-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Write-Host "Starting deployment: $DeploymentName" -ForegroundColor Yellow

try {
    az deployment group create \`
        --resource-group $ResourceGroup \`
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

export function generateAll(state) {
  const d = prepareData(state);
  return {
    ps1: buildPS1(d),
    bicep: buildBicep(d),
    param: buildParam(d),
    deploy: buildDeploy(d),
  };
}

export const DEFAULT_STATE = {
  rg: 'Test-Deployment',
  oldRg: 'LAB',
  location: 'centralus',
  hubName: 'vnet-hub-220',
  hubPrefix: '10.220.0.0/16',
  hubSubnetName: 'Hub-Services',
  hubSubnetPrefix: '10.220.1.0/24',
  gwPrefix: '10.220.255.0/27',
  spokes: [
    { name: 'vnet-spoke-221', addr: '10.221.0.0/16', sub: '10.221.1.0/24' },
    { name: 'vnet-spoke-222', addr: '10.222.0.0/16', sub: '10.222.1.0/24' },
    { name: 'vnet-spoke-223', addr: '10.223.0.0/16', sub: '10.223.1.0/24' },
  ],
  pipName: 'pip-vpngw-test',
  gwName: 'vng-test-hub',
  gwSku: 'VpnGw1AZ',
  lngName: 'lng-home-unifi',
  connName: 'conn-home-unifi',
  onPremIp: '99.20.245.59',
  onPremPrefixes: '10.17.0.0/16',
  dhGroup: 'DHGroup14',
  pfsGroup: 'None',
  ikeEnc: 'AES256',
  ikeInt: 'SHA256',
  ipsecEnc: 'AES256',
  ipsecInt: 'SHA256',
  saLifetime: '27000',

  // Azure Firewall
  firewall: {
    enabled: false,
    name: 'afw-hub',
    sku: 'Standard',
    policyName: 'afwp-hub',
    subnetPrefix: '10.220.0.0/26',
    pipName: 'pip-afw-hub',
    forceRoute: true,
  },

  // NSGs on spoke subnets
  nsgPerSpoke: false,

  // Load Balancers
  loadBalancers: [],

  // Azure Front Door
  frontDoor: {
    enabled: false,
    profileName: 'afd-profile',
    sku: 'Standard_AzureFrontDoor',
    endpointName: 'afd-endpoint',
    originHostname: '',
    wafEnabled: false,
    wafPolicyName: 'wafpolicy',
  },
};

export const DEFAULT_LB = {
  name: '',
  type: 'Internal',
  sku: 'Standard',
  spoke: '',
  frontendIp: '',
  port: 80,
  probePort: 80,
  protocol: 'Tcp',
};

export const LOCATIONS = [
  { value: 'centralus', label: 'Central US' },
  { value: 'eastus', label: 'East US' },
  { value: 'eastus2', label: 'East US 2' },
  { value: 'westus', label: 'West US' },
  { value: 'westus2', label: 'West US 2' },
  { value: 'westus3', label: 'West US 3' },
  { value: 'northcentralus', label: 'North Central US' },
  { value: 'southcentralus', label: 'South Central US' },
  { value: 'northeurope', label: 'North Europe' },
  { value: 'westeurope', label: 'West Europe' },
  { value: 'uksouth', label: 'UK South' },
  { value: 'eastasia', label: 'East Asia' },
  { value: 'southeastasia', label: 'Southeast Asia' },
  { value: 'australiaeast', label: 'Australia East' },
];

export const GW_SKUS = [
  { value: 'VpnGw1AZ', label: 'VpnGw1AZ (zone-redundant)' },
  { value: 'VpnGw2AZ', label: 'VpnGw2AZ (zone-redundant)' },
  { value: 'VpnGw3AZ', label: 'VpnGw3AZ (zone-redundant)' },
  { value: 'VpnGw1', label: 'VpnGw1 (no zone redundancy)' },
  { value: 'VpnGw2', label: 'VpnGw2 (no zone redundancy)' },
  { value: 'VpnGw3', label: 'VpnGw3 (no zone redundancy)' },
];

export const FW_SKUS = ['Standard', 'Premium'];
export const AFD_SKUS = [
  { value: 'Standard_AzureFrontDoor', label: 'Standard' },
  { value: 'Premium_AzureFrontDoor', label: 'Premium (required for WAF)' },
];

export const DH_GROUPS = ['DHGroup14', 'DHGroup2', 'DHGroup24', 'ECP256', 'ECP384'];
export const PFS_GROUPS = ['None', 'PFS2', 'PFS14', 'PFS24', 'ECP256', 'ECP384'];
export const IKE_ENCRYPTIONS = ['AES256', 'AES128', 'GCMAES256', 'GCMAES128'];
export const IKE_INTEGRITIES = ['SHA256', 'SHA384', 'SHA1', 'GCMAES256', 'GCMAES128'];
export const IPSEC_ENCRYPTIONS = ['AES256', 'AES128', 'GCMAES256', 'GCMAES192', 'GCMAES128'];
export const IPSEC_INTEGRITIES = ['SHA256', 'SHA1', 'GCMAES256', 'GCMAES192', 'GCMAES128'];

export const FILE_NAMES = {
  ps1: 'hub-spoke-vpn.ps1',
  bicep: 'hub-spoke-vpn.bicep',
  param: 'hub-spoke-vpn.bicepparam',
  deploy: 'Deploy-Network.ps1',
};

export const STORAGE_KEY = 'nb_state';

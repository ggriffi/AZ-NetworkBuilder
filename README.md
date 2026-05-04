# Azure Hub-Spoke Network Builder

A React web app for designing and deploying Azure hub-spoke network topologies with S2S VPN. Fill in the form, hit **Generate**, and get deployment-ready output files instantly.

![Azure Hub-Spoke Network Builder](https://img.shields.io/badge/Azure-Network%20Builder-0078d4?style=flat&logo=microsoftazure)

## What it generates

| Tab | File | Purpose |
|-----|------|---------|
| PS1 Script | `hub-spoke-vpn.ps1` | Standalone Azure CLI script — run directly in PowerShell |
| Bicep Template | `hub-spoke-vpn.bicep` | ARM/Bicep IaC template |
| Param File | `hub-spoke-vpn.bicepparam` | Bicep parameter file (PSK excluded) |
| Deploy Script | `Deploy-Network.ps1` | Self-contained script that embeds and deploys the Bicep template |

## What it deploys

- **Hub VNet** with a services subnet and GatewaySubnet
- **N spoke VNets** (add as many as needed)
- **Full hub-spoke peerings** with gateway transit enabled
- **Full mesh spoke-to-spoke peerings**
- **VPN Gateway** (zone-redundant AZ SKUs supported)
- **Local Network Gateway + S2S VPN connection** to on-premises
- **Custom IPsec policy** (IKE phase 1 & 2, DH/PFS groups, SA lifetime)

## Getting started

### Prerequisites

- Node.js 18+
- npm

### Run locally

```powershell
git clone https://github.com/ggriffi/AZ-NetworkBuilder.git
cd AZ-NetworkBuilder
npm install
npm run dev
```

App runs at `http://localhost:5173`.

### Build for deployment

```powershell
npm run build
```

Outputs a static site to `dist/` — drop it into Azure Static Web Apps, a storage account with static website hosting, or any web server.

## Usage

1. Fill in the form fields (values are saved automatically in your browser)
2. Click **Generate ▶** (or any download button — it auto-generates first)
3. Use **Copy**, **Download**, or **Download All** to grab the files
4. Run the PS1 or Deploy script against your Azure subscription

> **Note:** The VPN PSK is never stored or embedded in the param file. Both scripts prompt for it at runtime via `Read-Host`.

## Project structure

```
src/
├── App.jsx                  # Root component — state, localStorage, generate handler
├── App.css                  # Dark Azure theme
├── components/
│   ├── FormPanel.jsx        # All form sections
│   ├── SpokeRows.jsx        # Dynamic spoke add/remove rows
│   └── OutputPanel.jsx      # Tabs, output display, action buttons
└── lib/
    ├── builders.js          # PS1, Bicep, Param, and Deploy script generators
    └── defaults.js          # Default values, dropdown options, constants
```

## Tech stack

- [Vite](https://vitejs.dev/) + [React 18](https://react.dev/)
- No UI library — custom CSS matching the Azure portal aesthetic
- Zero runtime dependencies beyond React

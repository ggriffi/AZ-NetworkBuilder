# Azure Network Builder

A desktop app (Electron + React) for designing, generating, and deploying Azure hub-spoke network topologies with S2S VPN. Fill in the form, hit **Generate**, and get deployment-ready output files — then run them directly from the built-in terminal without leaving the app.

![Azure Hub-Spoke Network Builder](https://img.shields.io/badge/Azure-Network%20Builder-0078d4?style=flat&logo=microsoftazure)
![Electron](https://img.shields.io/badge/Electron-33-47848f?style=flat&logo=electron)
![React](https://img.shields.io/badge/React-18-61dafb?style=flat&logo=react)

---

## Features

### Builder
Design your hub-spoke topology through a form-driven UI. Values persist automatically in localStorage between sessions.

| Output Tab | File | Purpose |
|------------|------|---------|
| PS1 Script | `hub-spoke-vpn.ps1` | Standalone Azure CLI script — run directly in PowerShell |
| Bicep Template | `hub-spoke-vpn.bicep` | ARM/Bicep IaC template |
| Param File | `hub-spoke-vpn.bicepparam` | Bicep parameter file (PSK excluded) |
| Deploy Script | `Deploy-Network.ps1` | Self-contained script that embeds and deploys the Bicep template |
| Validate | — | Real-time config validation with error and warning counts |

### What it deploys

- **Hub VNet** with a services subnet and GatewaySubnet
- **N spoke VNets** — add as many as needed
- **Full hub-spoke peerings** with gateway transit enabled
- **Full mesh spoke-to-spoke peerings** (optional)
- **VPN Gateway** — zone-redundant AZ SKUs supported
- **Local Network Gateway + S2S VPN connection** to on-premises
- **Custom IPsec policy** — IKE phase 1 & 2, DH/PFS groups, SA lifetime
- **Azure Firewall** + Firewall Policy (optional)
- **NSG per spoke** with configurable rules (optional)
- **Internal Load Balancers** — multiple, per-spoke (optional)
- **Azure Front Door** Standard/Premium profile (optional)

### Diagnostics
40+ pre-built Azure CLI and PowerShell diagnostic tools organized by category. Select a section from the sidebar, fill in pre-populated fields (pulled from your current builder config), and run directly in the terminal.

| Section | Tools |
|---------|-------|
| Network Watcher | IP Flow Verify, Next Hop, Effective Routes, Effective NSG, Connectivity Test, Topology |
| VPN & Gateways | Connection status, Gateway status, IPsec policy, BGP peer status |
| NSG & Route Tables | List/inspect NSGs, route tables, UDR routes, subnet association |
| VNets & Peerings | List VNets/subnets/peerings, public IPs, address space details |
| Load Balancers & Front Door | LB rules, backend pools, health probes, AFD origins |
| Firewall & Security | Firewall status, policy rules, WAF policies, DDoS plans, Private Link |
| DNS & Private Endpoints | Private DNS zones, record sets, VNet links, DNS lookup, port test |
| Subscription & Resources | Resource groups, network resources, quota usage, Deployment What-If |

### Azure Auth (Electron only)
- Sign in with `az login` via the streaming terminal
- Subscription picker — switch subscriptions without leaving the app
- **VPN PSK field** — enter once in the auth bar, used automatically when running the Deploy Script

### Streaming Terminal (Electron only)
Collapsible terminal panel at the bottom of the window. Streams stdout/stderr in real time with colour coding. Kill running processes at any time.

---

## Getting started

### Prerequisites

- [Node.js 18+](https://nodejs.org/)
- [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli) (`az`) — required for diagnostics and deployment
- PowerShell 7+ (`pwsh`) — required for the streaming terminal

### Run as Electron desktop app (recommended)

```powershell
git clone https://github.com/ggriffi/AZ-NetworkBuilder.git
cd AZ-NetworkBuilder
npm install
npm run dev:electron
```

### Run as a browser app (builder + generator only)

```powershell
npm install
npm run dev
```

App runs at `http://localhost:5173`. Azure auth, terminal, and diagnostics require Electron — the builder and code generator work in any browser.

### Package as a distributable

```powershell
npm run dist
```

Outputs a Windows NSIS installer to `release/`. macOS (DMG) and Linux (AppImage) targets are also configured in `package.json`.

---

## Usage

1. **Auth bar** — sign in to Azure and select your subscription (Electron only)
2. **Builder tab** — fill in form fields and click **Generate ▶**
3. **Output tabs** — copy, download individual files, or **Download All**
4. **Deploy tab** — enter your VPN PSK in the auth bar, then click **Run Script ▶** to deploy directly
5. **Diagnostics tab** — pick a section from the sidebar, adjust fields, click **Run ▶**
6. **Terminal** — streams all output; click the header to collapse/expand

> **PSK handling:** The VPN pre-shared key is never embedded in the param file or stored on disk. It is held in memory and injected into the deploy script via `stdin` at runtime.

---

## Project structure

```
electron/
├── main.js          # Electron main process — IPC handlers, PowerShell spawn, Azure CLI, file dialogs
└── preload.js       # Context bridge — exposes electronAPI to the renderer

src/
├── App.jsx          # Root component — state, IPC wiring, Azure auth, terminal lines
├── App.css          # Dark Azure-themed stylesheet
├── components/
│   ├── AzureAuthBar.jsx     # Azure sign-in bar, subscription picker, VPN PSK field
│   ├── FormPanel.jsx        # Builder form — hub, spokes, VPN, firewall, LBs, Front Door
│   ├── SpokeRows.jsx        # Dynamic spoke add/remove rows
│   ├── OutputPanel.jsx      # Output tabs, copy/download buttons, deploy bar
│   ├── TerminalPanel.jsx    # Streaming terminal with ANSI stripping and kill button
│   └── DiagnosticsPanel.jsx # Sidebar nav + 40+ diagnostic tool cards
└── lib/
    ├── builders.js  # PS1, Bicep, Param, and Deploy script generators
    ├── defaults.js  # Default values, dropdown options, file name constants
    └── validator.js # Config validation — errors and warnings
```

---

## Tech stack

- [Electron 33](https://www.electronjs.org/) — desktop shell, IPC, file system access
- [Vite 5](https://vitejs.dev/) + [React 18](https://react.dev/) — UI framework and build tool
- [electron-builder](https://www.electron.build/) — cross-platform packaging
- No UI component library — custom CSS matching the Azure portal dark theme
- Zero runtime npm dependencies (React + React DOM only)

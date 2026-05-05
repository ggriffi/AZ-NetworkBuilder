const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const { spawn, exec } = require('child_process')
const { promisify } = require('util')
const path = require('path')
const fs = require('fs')

const execAsync = promisify(exec)
const isDev = process.argv.includes('--dev')
const devPort = (() => {
  const idx = process.argv.indexOf('--port')
  return idx !== -1 ? process.argv[idx + 1] : (process.env.VITE_PORT || '5173')
})()

let mainWindow
const procs = new Map()

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1680,
    height: 1000,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0f1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'Azure Network Builder',
  })

  if (isDev) {
    mainWindow.loadURL(`http://localhost:${devPort}`)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── PowerShell streaming execution ──────────────────────────────────────────

function spawnShell(args, opts = {}) {
  if (process.platform === 'win32') {
    return spawn('pwsh', ['-NoLogo', '-NoProfile', ...args], { env: process.env, ...opts })
  }
  return spawn('bash', args, { env: process.env, ...opts })
}

function wireProc(proc, id, resolve) {
  procs.set(id, proc)
  proc.stdout.on('data', (d) =>
    mainWindow?.webContents.send('ps:output', { id, data: d.toString(), stream: 'stdout' })
  )
  proc.stderr.on('data', (d) =>
    mainWindow?.webContents.send('ps:output', { id, data: d.toString(), stream: 'stderr' })
  )
  proc.on('close', (code) => {
    procs.delete(id)
    resolve({ code: code ?? 0 })
  })
  proc.on('error', (err) => {
    procs.delete(id)
    mainWindow?.webContents.send('ps:output', {
      id, data: `\nError: ${err.message}\n`, stream: 'stderr',
    })
    resolve({ code: 1 })
  })
}

ipcMain.handle('ps:exec', async (event, { command, id }) => {
  return new Promise((resolve) => {
    const proc = spawnShell(['-Command', command])
    wireProc(proc, id, resolve)
  })
})

ipcMain.handle('ps:kill', async (event, { id }) => {
  const proc = procs.get(id)
  if (proc) { proc.kill(); procs.delete(id); return true }
  return false
})

// Run a script file — writes to temp, pipes PSK via stdin if provided
ipcMain.handle('script:run', async (event, { content, id, psk }) => {
  return new Promise((resolve) => {
    const tmp = path.join(app.getPath('temp'), `nb-deploy-${Date.now()}.ps1`)
    fs.writeFileSync(tmp, content, 'utf8')

    const proc = spawnShell(['-File', tmp], { stdio: ['pipe', 'pipe', 'pipe'] })
    wireProc(proc, id, (result) => {
      try { fs.unlinkSync(tmp) } catch {}
      resolve(result)
    })

    // Inject PSK into stdin so Read-Host -AsSecureString consumes it
    if (psk !== undefined && psk !== null) {
      try { proc.stdin.write(psk + '\n'); proc.stdin.end() } catch {}
    }
  })
})

// ── Azure CLI structured calls ───────────────────────────────────────────────

async function azJson(cmd) {
  const shell = process.platform === 'win32' ? 'cmd' : 'bash'
  const flag = process.platform === 'win32' ? '/c' : '-c'
  const { stdout } = await execAsync(`az ${cmd}`, { shell })
  return JSON.parse(stdout)
}

ipcMain.handle('az:accounts', async () => {
  try { return await azJson('account list --output json') }
  catch { return [] }
})

ipcMain.handle('az:set-account', async (event, { id }) => {
  const shell = process.platform === 'win32' ? 'cmd' : 'bash'
  const flag = process.platform === 'win32' ? '/c' : '-c'
  await execAsync(`az account set --subscription "${id}"`, { shell })
  return azJson('account show --output json')
})

ipcMain.handle('az:current-account', async () => {
  try { return await azJson('account show --output json') }
  catch { return null }
})

// ── File operations ──────────────────────────────────────────────────────────

ipcMain.handle('file:save', async (event, { defaultName, content }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: [
      { name: 'PowerShell', extensions: ['ps1'] },
      { name: 'Bicep', extensions: ['bicep', 'bicepparam'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  })
  if (!result.canceled && result.filePath) {
    fs.writeFileSync(result.filePath, content, 'utf8')
    return { saved: true, filePath: result.filePath }
  }
  return { saved: false }
})

ipcMain.handle('config:save', async (event, { config }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: 'network-config.json',
    filters: [{ name: 'JSON Config', extensions: ['json'] }],
  })
  if (!result.canceled && result.filePath) {
    fs.writeFileSync(result.filePath, JSON.stringify(config, null, 2), 'utf8')
    return { saved: true, filePath: result.filePath }
  }
  return { saved: false }
})

ipcMain.handle('file:open', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: 'JSON Config', extensions: ['json'] }],
    properties: ['openFile'],
  })
  if (!result.canceled && result.filePaths[0]) {
    const content = fs.readFileSync(result.filePaths[0], 'utf8')
    return { content, filePath: result.filePaths[0] }
  }
  return null
})

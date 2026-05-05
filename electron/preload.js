const { contextBridge, ipcRenderer } = require('electron')

// Single persistent listener sets — avoids duplicate output on re-renders
const outputHandlers = new Set()
const doneHandlers = new Set()

ipcRenderer.on('ps:output', (_, data) => outputHandlers.forEach((h) => h(data)))
ipcRenderer.on('ps:done', (_, data) => doneHandlers.forEach((h) => h(data)))

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,

  // PowerShell streaming execution
  psExec: (command, id) => ipcRenderer.invoke('ps:exec', { command, id }),
  psKill: (id) => ipcRenderer.invoke('ps:kill', { id }),
  scriptRun: (content, id, psk) => ipcRenderer.invoke('script:run', { content, id, psk }),

  // Callback registration — returns unsubscribe function
  onPsOutput: (cb) => { outputHandlers.add(cb); return () => outputHandlers.delete(cb) },
  onPsDone:   (cb) => { doneHandlers.add(cb);   return () => doneHandlers.delete(cb) },

  // Azure CLI structured queries
  azGetAccounts:   () => ipcRenderer.invoke('az:accounts'),
  azSetAccount:    (id) => ipcRenderer.invoke('az:set-account', { id }),
  azCurrentAccount: () => ipcRenderer.invoke('az:current-account'),

  // File operations
  fileSave:   (defaultName, content) => ipcRenderer.invoke('file:save', { defaultName, content }),
  fileOpen:   () => ipcRenderer.invoke('file:open'),
  configSave: (config) => ipcRenderer.invoke('config:save', { config }),
})

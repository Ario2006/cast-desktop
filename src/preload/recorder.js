import { contextBridge, ipcRenderer } from 'electron'

// Preload for the hidden recorder window only: chunk streaming + start/stop signalling.
contextBridge.exposeInMainWorld('recorder', {
  onStart: (cb) => ipcRenderer.on('recorder:start', (_e, opts) => cb(opts)),
  onStop: (cb) => ipcRenderer.on('recorder:stop', () => cb()),
  chunk: (buffer) => ipcRenderer.send('recorder:chunk', buffer),
  started: () => ipcRenderer.send('recorder:started'),
  error: (message) => ipcRenderer.send('recorder:error', String(message)),
  done: () => ipcRenderer.send('recorder:done')
})

import fs from 'node:fs'
import path from 'node:path'
import { BrowserWindow, desktopCapturer, ipcMain, screen } from 'electron'
import { assertScreenPermission, CaptureError } from './capture.js'
import { ensureDir, expandHome, uniquePath } from './paths.js'

/**
 * Screen recording: a hidden renderer window runs getDisplayMedia + MediaRecorder and streams
 * chunks back over IPC; the main process writes them to disk. State lives here, so the
 * recording survives the launcher being hidden.
 *
 * onChange({ recording, startedAt }) is called on every transition (tray indicator, shortcut).
 */
export function createRecorder({
  getSettings,
  systemPreferences,
  shell,
  capturesRepo,
  hideLauncher,
  notify,
  onChange,
  recorderPage,
  log
}) {
  let win = null
  let stream = null
  let state = null // { file, startedAt, resolveStop }

  const isRecording = () => Boolean(state)
  const fromRecorder = (e) => win && !win.isDestroyed() && e.sender === win.webContents

  ipcMain.on('recorder:chunk', (e, data) => {
    if (!fromRecorder(e) || !stream || !(data instanceof ArrayBuffer || ArrayBuffer.isView(data)))
      return
    stream.write(Buffer.from(data instanceof ArrayBuffer ? data : data.buffer))
  })

  function cleanup() {
    stream?.end()
    stream = null
    if (win && !win.isDestroyed()) win.destroy()
    win = null
    state = null
    onChange({ recording: false, startedAt: null })
  }

  ipcMain.on('recorder:done', (e) => {
    if (!fromRecorder(e) || !state) return
    const { file, startedAt, resolveStop } = state
    const durationMs = Date.now() - startedAt
    const finish = () => {
      cleanup()
      capturesRepo.insert({ kind: 'recording', path: file, durationMs })
      notify({
        title: 'Recording saved',
        body: path.basename(file),
        actions: [{ text: 'Reveal in Finder', onAction: () => shell.showItemInFolder(file) }],
        onClick: () => shell.showItemInFolder(file)
      })
      resolveStop?.({ path: file, durationMs })
    }
    stream ? stream.end(finish) : finish()
  })

  return {
    isRecording,

    async start({ audio } = {}) {
      if (state) throw new CaptureError('BUSY', 'Already recording')
      assertScreenPermission(systemPreferences)
      const settings = getSettings()
      const wantMic = audio ?? settings.recordMic
      if (wantMic && systemPreferences.getMediaAccessStatus('microphone') !== 'granted') {
        const ok = await systemPreferences.askForMediaAccess('microphone')
        if (!ok)
          throw new CaptureError('PERMISSION', 'Microphone permission required', {
            permission: 'microphone'
          })
      }
      const dir = ensureDir(expandHome(settings.recordingFolder))
      const file = uniquePath(dir, 'Cast Recording', 'webm')
      hideLauncher()

      win = new BrowserWindow({
        show: false,
        width: 200,
        height: 100,
        webPreferences: {
          preload: recorderPage.preload,
          partition: 'cast-recorder',
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          backgroundThrottling: false
        }
      })
      const ses = win.webContents.session
      ses.setPermissionRequestHandler((_wc, permission, cb) =>
        cb(['media', 'display-capture'].includes(permission))
      )
      ses.setDisplayMediaRequestHandler(
        async (_request, callback) => {
          try {
            const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
            const sources = await desktopCapturer.getSources({ types: ['screen'] })
            const source =
              sources.find((s) => String(s.display_id) === String(display.id)) ?? sources[0]
            callback(source ? { video: source } : {})
          } catch {
            callback({})
          }
        },
        { useSystemPicker: false }
      )
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

      const started = new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new CaptureError('FAILED', 'Recording did not start')),
          10_000
        )
        const onStarted = (e) => {
          if (!fromRecorder(e)) return
          clearTimeout(timeout)
          ipcMain.off('recorder:started', onStarted)
          ipcMain.off('recorder:error', onError)
          resolve()
        }
        const onError = (e, message) => {
          if (!fromRecorder(e)) return
          clearTimeout(timeout)
          ipcMain.off('recorder:started', onStarted)
          ipcMain.off('recorder:error', onError)
          log?.warn('recorder error', { message: String(message).slice(0, 200) })
          reject(
            new CaptureError(
              'FAILED',
              'Could not capture the screen — check Screen Recording permission'
            )
          )
        }
        ipcMain.on('recorder:started', onStarted)
        ipcMain.on('recorder:error', onError)
      })

      stream = fs.createWriteStream(file)
      state = { file, startedAt: Date.now(), resolveStop: null }
      try {
        await win.loadURL(recorderPage.url)
        win.webContents.send('recorder:start', { audio: Boolean(wantMic) })
        await started
      } catch (e) {
        cleanup()
        fs.rmSync(file, { force: true })
        throw e
      }
      state.startedAt = Date.now()
      onChange({ recording: true, startedAt: state.startedAt })
      return { path: file }
    },

    stop() {
      if (!state) return Promise.resolve(null)
      return new Promise((resolve) => {
        state.resolveStop = resolve
        win?.webContents.send('recorder:stop')
        // Safety net: if the page never answers, finalize whatever has been written.
        setTimeout(() => {
          if (state?.resolveStop === resolve)
            ipcMain.emit('recorder:done', { sender: win?.webContents })
        }, 8000).unref?.()
      })
    }
  }
}

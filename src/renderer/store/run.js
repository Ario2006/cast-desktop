import { getAction } from '@shared/actionRegistry'
import { inputShape } from '@shared/inputShape'
import { api } from '../api'
import { useStore } from './useStore'

const FEEDBACK_MS = 550

/** Resolve a live row (weather, translation, transforms…) if its result hasn't arrived yet. */
export async function resolveRow(s) {
  if (s.resolved) return s.resolved
  const action = getAction(s.actionId)
  if (action?.sync) return action.sync(s.params, useStore.getState().ctx())
  if (action?.live) return api.live.resolve(s.actionId, s.params)
  return null
}

/** Show a short confirmation, then hide the launcher. */
function done(message, kind = 'success') {
  const st = useStore.getState()
  if (message) st.showToast(message, kind, FEEDBACK_MS + 500)
  setTimeout(() => useStore.getState().hide(), message ? FEEDBACK_MS : 0)
}

/** Pick a colour anywhere on screen with Chromium's EyeDropper and copy its HEX value. */
async function pickColor() {
  if (!('EyeDropper' in window))
    throw Object.assign(new Error('Color picking isn’t supported here'), { code: 'UNSUPPORTED' })
  try {
    const { sRGBHex } = await new window.EyeDropper().open()
    const hex = sRGBHex.startsWith('#')
      ? sRGBHex.toUpperCase()
      : `#${sRGBHex
          .match(/\d+/g)
          .slice(0, 3)
          .map((n) => Number(n).toString(16).padStart(2, '0'))
          .join('')
          .toUpperCase()}`
    await api.app.copy(hex)
    return `Copied ${hex}`
  } catch (e) {
    if (e?.name === 'AbortError') return null // Esc
    throw e
  }
}

function handleError(e, retry) {
  const st = useStore.getState()
  if (e.code === 'CONFIRM' && retry) {
    // destructive commands (restart, kill port, empty trash…) ask first
    st.openWidget('confirm', { message: e.message, retry })
  } else if (e.code === 'PERMISSION' && e.permission) {
    st.setPermissionCard({ permission: e.permission, message: e.message })
  } else {
    st.showToast(e.message, 'error', 3800)
  }
}

/** Run an instant action in main, with the confirm / permission / toast handling. */
export async function runInstant(actionId, params) {
  const action = getAction(actionId)
  try {
    const result = await api.actions.run(actionId, params)
    if (useStore.getState().settings.keepHistory) useStore.getState().refreshHistory()
    if (result?.cancelled) return
    done(result?.message, action?.copies ? 'success' : 'info')
  } catch (e) {
    handleError(e, { actionId, params: { ...params, confirmed: true } })
  }
}

/** Run a suggestion: widgets open in place, instant actions execute then hide. */
export async function runSuggestion(s, { alt = false } = {}) {
  const st = useStore.getState()
  const action = getAction(s.actionId)
  if (!action) return

  // remember which action you pick for this kind of input (coarse shape only, never the text)
  const shape = inputShape(st.query)
  if (shape && st.settings.learnFromChoices) {
    api.history
      .learn(shape, s.actionId)
      .then(() => st.refreshHistory())
      .catch(() => {})
  }

  if (action.kind === 'widget') {
    st.openWidget(s.actionId, s.params)
    return
  }

  if (s.actionId === 'color.pick') {
    try {
      const msg = await pickColor()
      if (msg) done(msg)
    } catch (e) {
      handleError(e)
    }
    return
  }

  // Live / sync rows: Enter copies the result or opens its page.
  if (action.onRun) {
    try {
      const r = await resolveRow(s)
      if (!r) throw new Error('Nothing to use yet')
      if (st.settings.keepHistory)
        api.history.record(s.actionId, (r.title ?? s.title).slice(0, 120)).catch(() => {})
      if (action.onRun === 'open' && r.url) {
        await api.actions.run('web.openUrl', { url: r.url })
        return
      }
      const text = r.copyText ?? (action.onRun === 'copy' ? r.title : null)
      if (!text) throw new Error(r.title ?? 'Nothing to copy')
      await api.app.copy(text)
      done(`Copied ${text.length > 40 ? `${text.slice(0, 39)}…` : text}`)
    } catch (e) {
      handleError(e)
    }
    return
  }

  // ⌘↵: reveal files in Finder, open projects in the terminal.
  let params = s.params
  if (alt && s.actionId === 'file.open') params = { ...params, reveal: true }
  if (alt && s.actionId === 'project.open') params = { ...params, target: 'terminal' }
  await runInstant(s.actionId, params)
}

/** Fill the input with the selected suggestion's completion text (Tab). */
export function autocomplete(s) {
  if (!s?.autocomplete) return false
  useStore.getState().setQuery(s.autocomplete)
  return true
}

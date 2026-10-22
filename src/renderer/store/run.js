import { getAction } from '@shared/actionRegistry'
import { inputShape } from '@shared/inputShape'
import { api } from '../api'
import { useStore } from './useStore'

const copyFeedbackMs = 450

/** Run a suggestion: widgets open in place, instant actions execute in main then hide. */
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

  // ⌘↵ on a file row reveals it in Finder instead of opening it.
  const params = alt && s.actionId === 'file.open' ? { ...s.params, reveal: true } : s.params

  try {
    const result = await api.actions.run(s.actionId, params)
    if (st.settings.keepHistory) st.refreshHistory()
    if (result?.message && action.copies) {
      st.showToast(result.message, 'success', copyFeedbackMs + 400)
      setTimeout(() => useStore.getState().hide(), copyFeedbackMs)
    } else if (result?.cancelled) {
      // user pressed Esc in the capture UI — nothing to report
    }
  } catch (e) {
    if (e.code === 'PERMISSION' && e.permission) {
      st.setPermissionCard({ permission: e.permission, message: e.message })
    } else {
      st.showToast(e.message, 'error', 3500)
    }
  }
}

/** Fill the input with the selected suggestion's completion text (Tab). */
export function autocomplete(s) {
  if (!s?.autocomplete) return false
  useStore.getState().setQuery(s.autocomplete)
  return true
}

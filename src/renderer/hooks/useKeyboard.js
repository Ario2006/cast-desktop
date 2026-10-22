import { useEffect } from 'react'
import { MAX_SUGGESTIONS } from '@shared/constants'
import { api } from '../api'
import { autocomplete, runSuggestion } from '../store/run'
import { useStore } from '../store/useStore'

/** Global key handling for the launcher list. Widgets handle their own Enter/arrow keys. */
export function useKeyboard() {
  useEffect(() => {
    const onKeyDown = (e) => {
      const st = useStore.getState()
      const mod = e.metaKey

      if (mod && e.key === ',') {
        e.preventDefault()
        if (st.view === 'settings') st.closeSettings()
        else st.openSettings()
        return
      }

      if (st.view === 'settings') {
        if (e.key === 'Escape') {
          e.preventDefault()
          st.closeSettings()
        }
        return
      }

      if (e.key === 'Escape') {
        e.preventDefault()
        if (st.permissionCard) useStore.setState({ permissionCard: null })
        else if (st.activeWidget) st.closeWidget()
        else if (st.query) st.setQuery('')
        else st.hide()
        return
      }

      if (st.activeWidget) return // widgets own the rest

      const selected = st.suggestions[st.selected]
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          st.move(1)
          return
        case 'ArrowUp':
          e.preventDefault()
          st.move(-1)
          return
        case 'Enter':
          e.preventDefault()
          if (selected) runSuggestion(selected, { alt: mod })
          return
        case 'Tab':
          e.preventDefault()
          autocomplete(selected)
          return
      }

      if (mod && /^[1-7]$/.test(e.key)) {
        e.preventDefault()
        const n = Number(e.key) - 1
        if (n < Math.min(MAX_SUGGESTIONS, st.suggestions.length)) runSuggestion(st.suggestions[n])
        return
      }

      // ⌘C with nothing selected in the input copies the highlighted calculator/conversion result.
      if (mod && e.key.toLowerCase() === 'c' && selected?.copies) {
        const el = document.activeElement
        const hasSelection = el?.selectionStart != null && el.selectionStart !== el.selectionEnd
        if (!hasSelection) {
          e.preventDefault()
          runSuggestion(selected)
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}

/** Wire main-process pushes into the store. */
export function useBridgeEvents() {
  useEffect(() => {
    const st = () => useStore.getState()
    const offs = [
      api.launcher.onShown(() => st().onShown()),
      api.launcher.onHidden(() => st().onHidden()),
      api.launcher.onOpenWidget(({ actionId, params }) => st().openWidget(actionId, params)),
      api.launcher.onOpenSettings((p) => st().openSettings(p?.section)),
      api.timers.onUpdate((snap) => st().applyTimerUpdate(snap)),
      api.settings.onChange((c) => st().applySettingChange(c)),
      api.status.onUpdate((status) => useStore.setState({ status })),
      api.status.onUpdate(() => st().recompute())
    ]
    st().init()
    return () => offs.forEach((off) => off())
  }, [])
}

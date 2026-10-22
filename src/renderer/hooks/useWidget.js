import { createElement, useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'

export const isEditable = (el) =>
  el instanceof HTMLElement &&
  (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))

/** Window-level key handler for a widget. Return true from `handler` to preventDefault. */
export function useWidgetKeys(handler) {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    const on = (e) => {
      if (ref.current(e)) e.preventDefault()
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [])
}

/** Contextual footer hints: [['Space', 'Pause'], ['R', 'Reset']] */
export function useFooterHints(hints) {
  const key = JSON.stringify(hints)
  useEffect(() => {
    const el = hints.map(([k, label]) =>
      createElement('span', { key: k }, createElement('kbd', null, k), ` ${label}`)
    )
    useStore.getState().setFooterHint(el)
    return () => useStore.getState().setFooterHint(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}

/** Remember the created timer's id on the active widget so reopening the launcher restores it. */
export function pinWidgetParams(patch) {
  useStore.setState((s) =>
    s.activeWidget
      ? { activeWidget: { ...s.activeWidget, params: { ...s.activeWidget.params, ...patch } } }
      : {}
  )
}

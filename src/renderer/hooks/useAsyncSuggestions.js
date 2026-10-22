import { useEffect, useRef } from 'react'
import { getAction, makeSuggestion } from '@shared/actionRegistry'
import { AI_DEBOUNCE_MS, AI_MIN_INPUT } from '@shared/constants'
import { formatMoney } from '@shared/currency'
import { fullyHandledLocally, intentsToSuggestions } from '@shared/suggest'
import { api } from '../api'
import { useStore } from '../store/useStore'

const FILE_DEBOUNCE_MS = 140
const OPEN_PREFIX = /^(?:open|launch|find|file)\s+/i

/**
 * Tier 1.5 (files, apps, notes) and Tier 2 (AI) suggestions. Everything here is async,
 * debounced and cancellable; the synchronous local tier lives in the store's setQuery.
 */
export function useAsyncSuggestions() {
  const query = useStore((s) => s.query)
  const widgetOpen = useStore((s) => Boolean(s.activeWidget))
  const seq = useRef(0)
  const lastAiRequest = useRef(null)

  useEffect(() => {
    const mySeq = ++seq.current
    const stale = () => mySeq !== seq.current
    const q = query.trim()

    if (lastAiRequest.current) {
      api.suggest.cancel(lastAiRequest.current)
      lastAiRequest.current = null
    }
    useStore.getState().setAiPending(false)
    if (!q || widgetOpen) return

    const { parts } = useStore.getState()
    const handled = fullyHandledLocally(parts.local)
    const timers = []

    // --- files, apps, notes ---------------------------------------------------------------
    if (!handled && q.length >= 2) {
      const explicit = OPEN_PREFIX.test(q)
      const term = q.replace(OPEN_PREFIX, '').trim()
      timers.push(
        setTimeout(async () => {
          if (term.length < 2) return
          const ctx = useStore.getState().ctx()
          try {
            const { files, apps } = await api.suggest.files(term)
            if (stale()) return
            const rows = [
              ...apps.map((a, i) =>
                makeSuggestion(getAction('app.open'), { path: a.path, name: a.name }, ctx, {
                  source: 'files',
                  matchScore:
                    (a.name.toLowerCase().startsWith(term.toLowerCase()) ? 0.8 : 0.55) -
                    i * 0.02 +
                    (explicit ? 0.1 : 0)
                })
              ),
              ...files.map((f, i) =>
                makeSuggestion(getAction('file.open'), { path: f.path, isDir: f.isDir }, ctx, {
                  source: 'files',
                  matchScore: (explicit ? 0.6 : 0.4) - i * 0.02
                })
              )
            ]
            useStore.getState().setParts({ files: rows })
          } catch {
            /* file search is best-effort */
          }
        }, FILE_DEBOUNCE_MS)
      )
    }

    if (!handled && q.length >= 3) {
      timers.push(
        setTimeout(async () => {
          try {
            const notes = await api.suggest.notes(q)
            if (stale()) return
            const ctx = useStore.getState().ctx()
            const rows = notes.map((n, i) =>
              makeSuggestion(getAction('note.create'), { noteId: n.id }, ctx, {
                source: 'notes',
                title: `Note: ${n.title}`,
                subtitle: n.snippet,
                icon: 'note-search',
                matchScore: 0.38 - i * 0.02
              })
            )
            useStore.getState().setParts({ notes: rows })
          } catch {
            /* ignore */
          }
        }, FILE_DEBOUNCE_MS + 60)
      )
    }

    // --- live currency rate (the local parser recognised "100 usd to eur") --------------------
    const money = parts.local.find((r) => r.actionId === 'currency.convert')
    if (money) {
      timers.push(
        setTimeout(async () => {
          const { amount, from, to } = money.params
          try {
            const r = await api.currency.convert(amount, from, to)
            if (stale()) return
            useStore.getState().setParts({
              rates: [
                {
                  ...money,
                  override: true,
                  title: `= ${r.text}`,
                  subtitle: `${formatMoney(amount, from)} · 1 ${from} = ${r.rate.toFixed(4)} ${to}${r.stale ? ' · offline rates' : r.date ? ` · ${r.date}` : ''}`
                }
              ]
            })
          } catch (e) {
            if (stale()) return
            useStore.getState().setParts({
              rates: [
                {
                  ...money,
                  override: true,
                  subtitle: e.code === 'OFFLINE' ? 'Offline: no saved rates yet' : e.message
                }
              ]
            })
          }
        }, 120)
      )
    }

    // --- saved snippets ---------------------------------------------------------------------------
    if (!handled && q.length >= 2 && !q.startsWith(';')) {
      timers.push(
        setTimeout(async () => {
          try {
            const list = await api.suggest.snippets(q)
            if (stale()) return
            const ctx = useStore.getState().ctx()
            useStore.getState().setParts({
              snippets: list.map((n, i) =>
                makeSuggestion(getAction('snippet.copy'), { id: n.id, name: n.name }, ctx, {
                  source: 'snippets',
                  subtitle: n.preview,
                  matchScore: 0.42 - i * 0.02
                })
              )
            })
          } catch {
            /* ignore */
          }
        }, FILE_DEBOUNCE_MS)
      )
    }

    // --- AI intents --------------------------------------------------------------------------
    const { settings } = useStore.getState()
    if (settings.smartSuggestions && !handled && q.length >= AI_MIN_INPUT) {
      timers.push(
        setTimeout(async () => {
          const requestId = `${Date.now()}-${mySeq}`
          lastAiRequest.current = requestId
          useStore.getState().setAiPending(true)
          try {
            const res = await api.suggest.ai(q, requestId)
            if (stale()) return
            if (res.ok) {
              const rows = intentsToSuggestions(res.intents, useStore.getState().ctx())
              useStore.getState().setParts({ ai: rows })
            }
          } catch {
            /* offline etc: status updates arrive separately; keep local results */
          } finally {
            if (!stale()) useStore.getState().setAiPending(false)
            if (lastAiRequest.current === requestId) lastAiRequest.current = null
          }
        }, AI_DEBOUNCE_MS)
      )
    }

    return () => timers.forEach(clearTimeout)
  }, [query, widgetOpen])
}

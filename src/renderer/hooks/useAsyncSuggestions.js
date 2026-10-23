import { useEffect, useRef } from 'react'
import { getAction, makeSuggestion } from '@shared/actionRegistry'
import { AI_DEBOUNCE_MS, AI_MIN_INPUT } from '@shared/constants'
import { parseContact, parseProject, parseShortcut } from '@shared/commands'
import { fullyHandledLocally, intentsToSuggestions } from '@shared/suggest'
import { api } from '../api'
import { useStore } from '../store/useStore'

const FILE_DEBOUNCE_MS = 140
const OPEN_PREFIX = /^(?:open|launch|find|file)\s+/i

/**
 * Resolve live rows (weather, translations, definitions, rates…) and publish them as overrides
 * of the same key, so the row updates in place. Failures turn into a helpful subtitle.
 */
async function resolveLive(rows, stale) {
  const resolved = await Promise.all(
    rows.map(async (row) => {
      try {
        const r = await api.live.resolve(row.actionId, row.params)
        return {
          ...row,
          override: true,
          title: r.title,
          subtitle: r.subtitle,
          icon: r.icon ?? row.icon,
          resolved: r
        }
      } catch (e) {
        return { ...row, override: true, subtitle: e.message, resolveError: e.code ?? 'ERROR' }
      }
    })
  )
  if (stale()) return
  const prev = useStore.getState().parts.live.filter((r) => !resolved.some((x) => x.key === r.key))
  useStore.getState().setParts({ live: [...prev, ...resolved] })
}

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

    // --- live rows: weather, definitions, translations, rates, transforms… (resolved in main) ---------
    const liveRows = parts.local.filter((r) => getAction(r.actionId)?.live)
    if (liveRows.length) timers.push(setTimeout(() => resolveLive(liveRows, stale), 120))

    // --- projects / scripts / Shortcuts / contacts ---------------------------------------------------
    const proj = parseProject(q)
    if (proj || (!handled && q.length >= 4)) {
      timers.push(
        setTimeout(async () => {
          const items = await api.suggest.projects(proj?.query ?? q).catch(() => [])
          if (stale() || !items.length) return
          const ctx = useStore.getState().ctx()
          useStore.getState().setParts({
            projects: items.map((p, i) =>
              makeSuggestion(getAction('project.open'), { path: p.path, name: p.name }, ctx, {
                source: 'projects',
                subtitle: `${p.display}${p.branch ? ` · ${p.branch}` : ''} · ⌘↵ terminal`,
                matchScore: (proj ? 0.85 : 0.42) - i * 0.03
              })
            )
          })
        }, FILE_DEBOUNCE_MS)
      )
    }
    if (useStore.getState().settings.scriptsEnabled && q.length >= 2) {
      const m = q.match(/^(?:script|run script)\s+(.*)$/i)
      timers.push(
        setTimeout(async () => {
          const items = await api.suggest.scripts(m ? m[1] : q).catch(() => [])
          if (stale() || !items.length) return
          const ctx = useStore.getState().ctx()
          useStore.getState().setParts({
            scripts: items.map((x, i) =>
              makeSuggestion(
                getAction('script.run'),
                { id: x.id, title: x.title, takesArgument: Boolean(x.argument) },
                ctx,
                {
                  source: 'scripts',
                  subtitle: x.description || `Script · ${x.id}`,
                  matchScore: (m ? 0.85 : 0.5) - i * 0.03
                }
              )
            )
          })
        }, FILE_DEBOUNCE_MS)
      )
    }
    const sc = parseShortcut(q)
    if (sc || (!handled && q.length >= 4)) {
      timers.push(
        setTimeout(async () => {
          const names = await api.suggest.shortcuts(sc?.query ?? q).catch(() => [])
          if (stale() || !names.length) return
          const ctx = useStore.getState().ctx()
          useStore.getState().setParts({
            shortcuts: names.map((name, i) =>
              makeSuggestion(getAction('shortcut.run'), { name }, ctx, {
                source: 'shortcuts',
                matchScore: (sc ? 0.86 : 0.4) - i * 0.03
              })
            )
          })
        }, FILE_DEBOUNCE_MS + 40)
      )
    }
    const contact = parseContact(q)
    if (contact && contact.query.length >= 2) {
      timers.push(
        setTimeout(async () => {
          try {
            const people = await api.suggest.contacts(contact.query)
            if (stale()) return
            const ctx = useStore.getState().ctx()
            const rows = []
            for (const person of people) {
              const values = contact.via === 'email' ? person.emails : person.phones
              for (const value of values.slice(0, 2)) {
                rows.push(
                  makeSuggestion(
                    getAction('contact.open'),
                    { via: contact.via, value, name: person.name },
                    ctx,
                    {
                      source: 'contacts',
                      matchScore: 0.9 - rows.length * 0.03
                    }
                  )
                )
              }
            }
            useStore.getState().setParts({ contacts: rows.slice(0, 5) })
          } catch (e) {
            if (!stale() && e.code === 'PERMISSION')
              useStore
                .getState()
                .setPermissionCard({ permission: 'automation', message: e.message })
          }
        }, 260)
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
                  matchScore: 0.55 - i * 0.02
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
              const live = rows.filter((r) => getAction(r.actionId)?.live)
              if (live.length) resolveLive(live, stale)
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

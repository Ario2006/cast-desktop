import { create } from 'zustand'
import { getAction, makeSuggestion } from '@shared/actionRegistry'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { inputShape, learnedBoost } from '@shared/inputShape'
import { rank } from '@shared/ranking'
import { localSuggestions } from '@shared/suggest'
import { api } from '../api'
import { emptyStateRows } from './emptyState'

const OUT_MS = 80
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Widgets that keep running state in main and stay on screen when the launcher is reopened. */
const PINNED_WIDGETS = new Set(['timer.start', 'stopwatch.start', 'pomodoro.start'])
// every async source writes its rows into one slot; `live` holds resolved results (weather, …)
const EMPTY_PARTS = {
  local: [],
  files: [],
  notes: [],
  ai: [],
  live: [],
  snippets: [],
  projects: [],
  scripts: [],
  shortcuts: [],
  contacts: []
}

function buildSuggestions(state, parts = state.parts) {
  if (!state.query.trim())
    return state.settings.showRecentOnEmpty
      ? emptyStateRows(state)
      : emptyStateRows({ ...state, recents: [] })
  const list = Object.values(parts).flat()
  // "learned": a small boost for what you usually pick for this kind of input (never the text itself)
  const counts = state.learned[inputShape(state.query)]
  const annotated = counts
    ? list.map((r) => ({ ...r, learned: learnedBoost(counts[r.actionId] ?? 0) }))
    : list
  return rank(annotated, { stats: state.stats, max: state.settings.maxResults })
}

/** Pick a selection index after the list changed: keep the user's row if they navigated. */
function keepSelection(prev, next) {
  if (prev.userMoved) {
    const key = prev.suggestions[prev.selected]?.key
    const idx = next.findIndex((s) => s.key === key)
    if (idx >= 0) return { selected: idx, userMoved: true }
  }
  return { selected: 0, userMoved: false }
}

export const useStore = create((set, get) => ({
  view: 'launcher', // 'launcher' | 'settings'
  settingsSection: 'general',
  query: '',
  parts: EMPTY_PARTS,
  suggestions: [],
  selected: 0,
  userMoved: false,
  activeWidget: null, // { actionId, params, id }
  permissionCard: null,
  settings: DEFAULT_SETTINGS,
  stats: {},
  learned: {},
  quicklinks: [],
  briefing: null,
  pomodoro: null,
  recents: [],
  timers: [],
  finishedTimers: {},
  reminders: [],
  status: { recording: false, ai: 'ready' },
  aiPending: false,
  toast: null,
  leaving: false,
  animToken: 0,
  footerHint: null,

  // --- bootstrap -----------------------------------------------------------------------
  async init() {
    const [settings, timers, status] = await Promise.all([
      api.settings.getAll(),
      api.timers.list(),
      api.status.get()
    ])
    // first run: show the walkthrough (don't rely on the 'shown' event, which can beat this listener)
    set({ settings, timers, status, ...(settings.onboarded ? {} : { view: 'welcome' }) })
    api.pomodoro
      .get()
      .then((pomodoro) => set({ pomodoro }))
      .catch(() => {})
    get().refreshHistory()
    get().loadQuicklinks()
    get().loadBriefing()
    get().recompute()
  },

  async loadQuicklinks() {
    const quicklinks = await api.quicklinks.list().catch(() => [])
    set({ quicklinks })
    if (get().query.trim()) get().setQuery(get().query)
  },

  /** The empty-state briefing (agenda, due tasks, weather); refreshed each time Cast opens. */
  async loadBriefing() {
    const briefing = await api.overview.briefing().catch(() => null)
    set({ briefing })
  },

  async refreshHistory() {
    const [stats, recents, learned] = await Promise.all([
      api.history.stats().catch(() => ({})),
      api.history.recent().catch(() => []),
      api.history.learned().catch(() => ({}))
    ])
    set({ stats, recents, learned })
    get().recompute()
  },

  // --- query / suggestions ---------------------------------------------------------------
  ctx() {
    const s = get()
    return {
      now: new Date(),
      settings: s.settings,
      recording: s.status.recording,
      quicklinks: s.quicklinks
    }
  },

  /** Tier 1 runs synchronously inside setQuery so local rows render on the same keystroke. */
  setQuery(query) {
    const s = get()
    if (s.activeWidget) set({ activeWidget: null })
    const local = query.trim() ? localSuggestions(query, get().ctx()) : []
    const parts = { ...EMPTY_PARTS, local }
    const next = buildSuggestions({ ...get(), query }, parts)
    set({
      query,
      parts,
      suggestions: next,
      permissionCard: null,
      toast: null,
      ...keepSelection(get(), next)
    })
  },

  setParts(patch) {
    const parts = { ...get().parts, ...patch }
    const next = buildSuggestions(get(), parts)
    set({ parts, suggestions: next, ...keepSelection(get(), next) })
  },

  recompute() {
    const next = buildSuggestions(get())
    set({ suggestions: next, ...keepSelection(get(), next) })
  },

  move(delta) {
    const { suggestions, selected } = get()
    if (!suggestions.length) return
    set({ selected: (selected + delta + suggestions.length) % suggestions.length, userMoved: true })
  },

  select: (selected) => set({ selected, userMoved: true }),

  // --- widgets ---------------------------------------------------------------------------
  openWidget(actionId, params = {}) {
    const action = getAction(actionId)
    set({
      activeWidget: { actionId, params, id: Date.now() },
      permissionCard: null,
      footerHint: null,
      view: 'launcher'
    })
    if (action && get().settings.keepHistory) {
      const { title } = action.describe(params, get().ctx())
      api.history
        .record(actionId, title.slice(0, 120))
        .then(() => get().refreshHistory())
        .catch(() => {})
    }
  },

  closeWidget: () => set({ activeWidget: null, footerHint: null }),
  setFooterHint: (footerHint) => set({ footerHint }),

  // --- views -----------------------------------------------------------------------------
  openSettings(section) {
    set({ view: 'settings', settingsSection: section ?? get().settingsSection })
  },
  closeSettings: () => set({ view: 'launcher' }),

  // --- window lifecycle -------------------------------------------------------------------
  onShown() {
    set((s) => ({
      animToken: s.animToken + 1,
      leaving: false,
      ...(s.settings.onboarded ? {} : { view: 'welcome' })
    }))
    get().refreshHistory()
    get().loadBriefing()
    api.status
      .get()
      .then((status) => set({ status }))
      .catch(() => {})
  },

  /** Reset transient state after the window hides (running timers/stopwatch stay pinned). */
  onHidden() {
    const w = get().activeWidget
    const keep = w && PINNED_WIDGETS.has(w.actionId) && w.params?.timerId
    set({
      view: get().settings.onboarded ? 'launcher' : 'welcome',
      leaving: false,
      query: '',
      parts: EMPTY_PARTS,
      permissionCard: null,
      toast: null,
      aiPending: false,
      ...(keep ? {} : { activeWidget: null, footerHint: null })
    })
    get().recompute()
  },

  /** Renderer-initiated hide with the short fade-out. */
  hide() {
    if (reduceMotion()) return api.launcher.hide()
    set({ leaving: true })
    setTimeout(() => api.launcher.hide(), OUT_MS)
  },

  // --- timers (pushed from main) ------------------------------------------------------------
  applyTimerUpdate(snapshot) {
    const finishedTimers = snapshot.finished
      ? { ...get().finishedTimers, [snapshot.finished.id]: snapshot.finished }
      : get().finishedTimers
    set({
      pomodoro: snapshot.pomodoro === undefined ? get().pomodoro : snapshot.pomodoro,
      timers: snapshot.timers ?? get().timers,
      reminders: snapshot.reminders ?? get().reminders,
      finishedTimers
    })
    get().recompute()
  },

  // --- feedback ----------------------------------------------------------------------------
  /** `action`: optional { label, run } button, e.g. Undo. */
  showToast(text, kind = 'info', ms = 2200, action = null) {
    const id = Date.now()
    set({ toast: { id, text, kind, action } })
    setTimeout(() => get().toast?.id === id && set({ toast: null }), ms)
  },
  setPermissionCard: (permissionCard) => set({ permissionCard }),
  setAiPending: (aiPending) => set({ aiPending }),

  // --- settings ----------------------------------------------------------------------------
  applySettingChange({ key, value }) {
    set({ settings: { ...get().settings, [key]: value } })
    get().recompute()
  },

  async setSetting(key, value) {
    const prev = get().settings[key]
    set({ settings: { ...get().settings, [key]: value } }) // optimistic
    try {
      await api.settings.set(key, value)
      return null
    } catch (e) {
      set({ settings: { ...get().settings, [key]: prev } })
      return e.message
    }
  }
}))

export { makeSuggestion }

import { useEffect, useState } from 'react'

const useVisible = () => {
  const [visible, setVisible] = useState(!document.hidden)
  useEffect(() => {
    const on = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])
  return visible
}

/** Re-render every `ms` while `active` and the window is visible (no work while hidden). */
export function useNow(ms = 1000, active = true) {
  const [now, setNow] = useState(() => Date.now())
  const visible = useVisible()
  useEffect(() => {
    if (!active || !visible) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms, active, visible])
  return now
}

/** Live elapsed / remaining for a timer view (computed from absolute timestamps). */
export function timerLive(t, now) {
  if (!t) return { elapsedMs: 0, remainingMs: 0 }
  const running = t.state === 'running' && t.startedAt != null
  const elapsedMs = t.accumulatedMs + (running ? Math.max(0, now - t.startedAt) : 0)
  return {
    elapsedMs,
    remainingMs: t.kind === 'timer' ? Math.max(0, t.durationMs - elapsedMs) : null
  }
}

import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import styles from './settings.module.css'

export function Row({ label, desc, error, children }) {
  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <div className={styles.rowLabel}>{label}</div>
        {desc && <div className={styles.rowDesc}>{desc}</div>}
        {error && <div className={styles.rowError}>{error}</div>}
      </div>
      <div className={styles.rowControl}>{children}</div>
    </div>
  )
}

export const SectionTitle = ({ children }) => <div className={styles.section}>{children}</div>

/** [value, setValue, error] bound to a persisted setting. */
export function useSetting(key) {
  const value = useStore((s) => s.settings[key])
  const [error, setError] = useState(null)
  const set = async (v) => setError(await useStore.getState().setSetting(key, v))
  return [value, set, error]
}

export function Toggle({ checked, onChange, label }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={styles.toggle}
      onClick={() => onChange(!checked)}
    />
  )
}

export function ToggleRow({ settingKey, label, desc }) {
  const [value, set, error] = useSetting(settingKey)
  return (
    <Row label={label} desc={desc} error={error}>
      <Toggle checked={Boolean(value)} onChange={set} label={label} />
    </Row>
  )
}

export function SelectRow({ settingKey, label, desc, options }) {
  const [value, set, error] = useSetting(settingKey)
  return (
    <Row label={label} desc={desc} error={error}>
      <select
        className={styles.select}
        value={value}
        onChange={(e) => set(typeof value === 'number' ? Number(e.target.value) : e.target.value)}
      >
        {options.map(([v, name]) => (
          <option key={v} value={v}>
            {name}
          </option>
        ))}
      </select>
    </Row>
  )
}

/** Text/number input that commits on blur or Enter. */
export function TextRow({ settingKey, label, desc, placeholder, number, narrow }) {
  const [value, set, error] = useSetting(settingKey)
  const [draft, setDraft] = useState(String(value ?? ''))
  useEffect(() => setDraft(String(value ?? '')), [value])
  const commit = () => {
    const next = number ? Number(draft) : draft.trim()
    if (next !== value) set(next)
  }
  return (
    <Row label={label} desc={desc} error={error}>
      <input
        className={`${styles.input} ${narrow ? styles.narrow : ''}`}
        value={draft}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
    </Row>
  )
}

const KEY_NAMES = {
  Space: 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Enter: 'Return',
  Backquote: '`', Minus: '-', Equal: '=', Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'",
  BracketLeft: '[', BracketRight: ']', Backslash: '\\', Tab: 'Tab', Backspace: 'Backspace'
} // prettier-ignore

/** KeyboardEvent -> Electron accelerator, or null while only modifiers are held / invalid. */
export function toAccelerator(e) {
  const mods = []
  if (e.metaKey) mods.push('Command')
  if (e.ctrlKey) mods.push('Control')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')
  const c = e.code
  const isF = /^F\d{1,2}$/.test(c)
  const key = c.startsWith('Key')
    ? c.slice(3)
    : c.startsWith('Digit')
      ? c.slice(5)
      : isF
        ? c
        : KEY_NAMES[c]
  if (!key) return null
  if (!mods.length && !isF) return null
  return [...mods, key].join('+')
}

export const prettyAccelerator = (a) =>
  a
    .replace('Command', '⌘')
    .replace('Control', '⌃')
    .replace('Alt', '⌥')
    .replace('Shift', '⇧')
    .replaceAll('+', ' ')

export function ShortcutRow({ settingKey, label, desc }) {
  const [value, set, error] = useSetting(settingKey)
  const [recording, setRecording] = useState(false)
  const [hint, setHint] = useState(null)

  useEffect(() => {
    if (!recording) return
    const on = (e) => {
      e.preventDefault()
      e.stopImmediatePropagation()
      if (e.key === 'Escape') return setRecording(false)
      const acc = toAccelerator(e)
      if (!acc) return setHint('Include a modifier key (⌘ ⌃ ⌥ ⇧)')
      setRecording(false)
      setHint(null)
      set(acc)
    }
    window.addEventListener('keydown', on, true)
    return () => window.removeEventListener('keydown', on, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording])

  return (
    <Row label={label} desc={desc} error={error ?? hint}>
      <button
        className={`${styles.btn} ${styles.shortcut}`}
        data-recording={recording}
        onClick={() => setRecording((r) => !r)}
      >
        {recording ? 'Press shortcut…' : prettyAccelerator(value)}
      </button>
    </Row>
  )
}

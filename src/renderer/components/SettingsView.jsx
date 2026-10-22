import { useCallback, useEffect, useState } from 'react'
import { ACTIONS } from '@shared/actionRegistry'
import { api } from '../api'
import { useStore } from '../store/useStore'
import {
  Row,
  SectionTitle,
  SelectRow,
  ShortcutRow,
  TextRow,
  Toggle,
  ToggleRow,
  useSetting
} from './SettingsControls'
import styles from './settings.module.css'

const SECTIONS = [
  ['general', 'General'],
  ['suggestions', 'Suggestions'],
  ['actions', 'Actions'],
  ['calendar', 'Calendar'],
  ['capture', 'Capture'],
  ['search', 'Search'],
  ['privacy', 'Privacy'],
  ['permissions', 'Permissions'],
  ['about', 'About']
]

function SecretRow({ name, label, desc, placeholder, configured, onChanged }) {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState(null)
  const save = async () => {
    if (!draft) return
    try {
      await api.settings.setSecret(name, draft)
      setDraft('')
      setError(null)
      onChanged()
    } catch (e) {
      setError(
        e.code === 'ENCRYPTION_UNAVAILABLE'
          ? 'Secure storage is unavailable on this Mac.'
          : e.message
      )
    }
  }
  const clear = async () => {
    await api.settings.setSecret(name, '')
    onChanged()
  }
  return (
    <Row label={label} desc={desc} error={error}>
      {configured && !draft && (
        <span className={styles.badge} data-ok="true">
          Saved
        </span>
      )}
      <input
        type="password"
        className={styles.input}
        style={{ width: configured ? 130 : 230 }}
        value={draft}
        placeholder={configured ? 'Replace…' : placeholder}
        autoComplete="off"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      {configured && (
        <button className={styles.btn} onClick={clear}>
          Remove
        </button>
      )}
    </Row>
  )
}

function General() {
  return (
    <>
      <ShortcutRow
        settingKey="shortcut"
        label="Global shortcut"
        desc="Summons Cast from anywhere. ⌘Space is taken by Spotlight."
      />
      <ToggleRow settingKey="launchAtLogin" label="Launch at login" />
      <ToggleRow
        settingKey="hideOnBlur"
        label="Hide when focus is lost"
        desc="Click outside to dismiss the launcher."
      />
      <ToggleRow
        settingKey="showOnActiveDisplay"
        label="Show on the active display"
        desc="Otherwise always the primary display."
      />
      <SelectRow
        settingKey="theme"
        label="Theme"
        options={[
          ['system', 'System'],
          ['light', 'Light'],
          ['dark', 'Dark']
        ]}
      />
      <ToggleRow
        settingKey="trayTimerTitle"
        label="Show timer in menu bar"
        desc="Remaining / elapsed time next to the icon."
      />
    </>
  )
}

function Suggestions({ secrets, refreshSecrets }) {
  const [test, setTest] = useState(null)
  const [testing, setTesting] = useState(false)
  const runTest = async () => {
    setTesting(true)
    setTest(null)
    try {
      setTest(await api.settings.testAi())
    } catch (e) {
      setTest({ ok: false, message: e.message })
    }
    setTesting(false)
  }
  return (
    <>
      <ToggleRow
        settingKey="smartSuggestions"
        label="Enable smart suggestions"
        desc="Sends the typed query (plus date/time and locale) to your AI provider. Nothing else."
      />
      <SectionTitle>AI provider (OpenAI-compatible)</SectionTitle>
      <TextRow settingKey="aiBaseUrl" label="Base URL" placeholder="https://api.openai.com/v1" />
      <TextRow settingKey="aiModel" label="Model" placeholder="gpt-4o-mini" />
      <SecretRow
        name="aiApiKey"
        label="API key"
        desc="Encrypted with the macOS Keychain. Never shown again."
        placeholder="sk-…"
        configured={secrets.aiApiKey}
        onChanged={refreshSecrets}
      />
      <Row label="Test connection" error={test && !test.ok ? test.message : null}>
        {test?.ok && (
          <span className={styles.result} data-ok="true">
            ✓ {test.message}
          </span>
        )}
        <button className={styles.btn} onClick={runTest} disabled={testing}>
          {testing ? 'Testing…' : 'Test'}
        </button>
      </Row>
      <SectionTitle>Results</SectionTitle>
      <SelectRow
        settingKey="maxResults"
        label="Maximum results"
        options={[
          [3, '3'],
          [4, '4'],
          [5, '5'],
          [6, '6'],
          [7, '7']
        ]}
      />
      <ToggleRow settingKey="showRecentOnEmpty" label="Show recent actions when empty" />
    </>
  )
}

function Actions() {
  const [disabled, setDisabled] = useSetting('disabledActions')
  const [favorites, setFavorites] = useSetting('favorites')
  const toggle = (list, id) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  return (
    <>
      <SelectRow
        settingKey="timerSound"
        label="Timer sound"
        options={[
          ['none', 'None'],
          ['Glass', 'Glass'],
          ['Ping', 'Ping'],
          ['Hero', 'Hero'],
          ['Submarine', 'Submarine'],
          ['Funk', 'Funk'],
          ['Sosumi', 'Sosumi']
        ]}
      />
      <TextRow
        settingKey="defaultEventMinutes"
        label="Default event length (minutes)"
        number
        narrow
      />
      <SectionTitle>Actions</SectionTitle>
      {ACTIONS.filter((a) => a.id !== 'record.stop').map((a) => (
        <Row key={a.id} label={a.title} desc={a.description}>
          <button
            className={styles.star}
            aria-pressed={favorites.includes(a.id)}
            aria-label={`Pin ${a.title} as a favorite`}
            title="Pin as favorite"
            onClick={() => setFavorites(toggle(favorites, a.id))}
          >
            ★
          </button>
          <Toggle
            checked={!disabled.includes(a.id)}
            label={`Enable ${a.title}`}
            onChange={() => setDisabled(toggle(disabled, a.id))}
          />
        </Row>
      ))}
    </>
  )
}

function Calendar({ secrets, refreshSecrets }) {
  const [state, setState] = useState({ busy: false, error: null })
  const connect = async () => {
    setState({ busy: true, error: null })
    try {
      await api.calendar.connect()
      setState({ busy: false, error: null })
    } catch (e) {
      setState({ busy: false, error: e.message })
    }
    refreshSecrets()
  }
  return (
    <>
      <Row
        label="Google account"
        desc="Sign in through your browser (PKCE, loopback redirect). Tokens are encrypted with the Keychain."
        error={state.error}
      >
        {secrets.googleConnected ? (
          <>
            <span className={styles.badge} data-ok="true">
              Connected
            </span>
            <button
              className={styles.btn}
              onClick={async () => {
                await api.calendar.disconnect()
                refreshSecrets()
              }}
            >
              Disconnect
            </button>
          </>
        ) : (
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={connect}
            disabled={state.busy}
          >
            {state.busy ? 'Waiting for browser…' : 'Connect'}
          </button>
        )}
      </Row>
      <SectionTitle>Your Google Cloud OAuth client (Desktop type)</SectionTitle>
      <TextRow
        settingKey="googleClientId"
        label="Client ID"
        placeholder="…apps.googleusercontent.com"
      />
      <SecretRow
        name="googleClientSecret"
        label="Client secret"
        desc="Optional; Google includes one for Desktop clients."
        placeholder="GOCSPX-…"
        configured={secrets.googleClientSecret}
        onChanged={refreshSecrets}
      />
      <SectionTitle>Defaults</SectionTitle>
      <TextRow
        settingKey="calendarDefaultId"
        label="Default calendar ID"
        desc="“primary” is your main calendar."
      />
      <TextRow
        settingKey="defaultEventMinutes"
        label="Default event length (minutes)"
        number
        narrow
      />
      <ToggleRow settingKey="calendarMeetDefault" label="Add Google Meet link by default" />
    </>
  )
}

function Capture() {
  return (
    <>
      <TextRow settingKey="screenshotFolder" label="Screenshot folder" />
      <SelectRow
        settingKey="screenshotFormat"
        label="Screenshot format"
        options={[
          ['png', 'PNG'],
          ['jpg', 'JPEG']
        ]}
      />
      <ToggleRow settingKey="copyScreenshotToClipboard" label="Copy screenshots to clipboard" />
      <TextRow settingKey="recordingFolder" label="Recording folder" />
      <ToggleRow
        settingKey="recordMic"
        label="Include microphone audio"
        desc="System audio capture isn’t supported by macOS without extra tooling."
      />
      <ShortcutRow
        settingKey="stopRecordingShortcut"
        label="Stop-recording shortcut"
        desc="Active only while recording."
      />
    </>
  )
}

function Search() {
  const engine = useStore((s) => s.settings.searchEngine)
  return (
    <>
      <SelectRow
        settingKey="searchEngine"
        label="Default search engine"
        options={[
          ['google', 'Google'],
          ['duckduckgo', 'DuckDuckGo'],
          ['brave', 'Brave'],
          ['kagi', 'Kagi'],
          ['custom', 'Custom URL']
        ]}
      />
      {engine === 'custom' && (
        <TextRow
          settingKey="customSearchUrl"
          label="URL template"
          desc="Use {query} where the search terms go."
          placeholder="https://example.com/?q={query}"
        />
      )}
      <Row label="Prefixes" desc="g · ddg · yt · kagi · brave — e.g. “yt lofi beats”" />
    </>
  )
}

function ConfirmButton({ label, onConfirm }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <button
      className={`${styles.btn} ${styles.btnDanger}`}
      onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}
    >
      {armed ? 'Click again to confirm' : label}
    </button>
  )
}

function Privacy() {
  const toast = useStore((s) => s.showToast)
  return (
    <>
      <ToggleRow
        settingKey="keepHistory"
        label="Keep action history"
        desc="Stores only the action you chose (never keystrokes) to power Recent and ranking."
      />
      <Row label="Clear action history">
        <ConfirmButton
          label="Clear"
          onConfirm={async () => (
            await api.history.clear(),
            useStore.getState().refreshHistory(),
            toast('History cleared')
          )}
        />
      </Row>
      <Row label="Clear all notes" desc="Permanently deletes every saved note.">
        <ConfirmButton
          label="Delete notes"
          onConfirm={async () => (await api.notes.clear(), toast('Notes deleted'))}
        />
      </Row>
      <Row label="Clear all reminders">
        <ConfirmButton
          label="Delete reminders"
          onConfirm={async () => (await api.reminders.clear(), toast('Reminders deleted'))}
        />
      </Row>
    </>
  )
}

const PERM_LABEL = {
  granted: 'Granted',
  denied: 'Denied',
  restricted: 'Restricted',
  'not-determined': 'Not requested yet',
  unknown: 'Unknown'
}

function Permissions() {
  const [status, setStatus] = useState(null)
  useEffect(() => {
    let alive = true
    const poll = () =>
      api.permissions
        .status()
        .then((s) => alive && setStatus(s))
        .catch(() => {})
    poll()
    const id = setInterval(poll, 2000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])
  const row = (type, label, desc) => {
    const s = status?.[type] ?? 'unknown'
    return (
      <Row label={label} desc={desc}>
        <span
          className={styles.badge}
          data-ok={
            s === 'granted' ? 'true' : s === 'denied' || s === 'restricted' ? 'false' : undefined
          }
        >
          {PERM_LABEL[s] ?? s}
        </span>
        <button className={styles.btn} onClick={() => api.permissions.open(type)}>
          Open System Settings
        </button>
      </Row>
    )
  }
  return (
    <>
      {row('screen', 'Screen Recording', 'Needed for screenshots and screen recordings.')}
      {row('microphone', 'Microphone', 'Only if “Include microphone audio” is on.')}
      <Row label="Notifications" desc="Timers and reminders use native notifications.">
        <button className={styles.btn} onClick={() => api.permissions.open('notifications')}>
          Open System Settings
        </button>
      </Row>
    </>
  )
}

function About() {
  const [info, setInfo] = useState(null)
  useEffect(
    () =>
      void api.app
        .info()
        .then(setInfo)
        .catch(() => {}),
    []
  )
  return (
    <>
      <Row label="Cast" desc={info ? `Version ${info.version}` : ''} />
      <Row label="Data folder" desc={info?.dataDir}>
        <button className={styles.btn} onClick={() => api.app.openPath('data')}>
          Open
        </button>
      </Row>
      <Row label="Logs" desc="Rotating log file (no queries or secrets).">
        <button className={styles.btn} onClick={() => api.app.openPath('logs')}>
          Reveal
        </button>
      </Row>
    </>
  )
}

export default function SettingsView() {
  const section = useStore((s) => s.settingsSection)
  const [secrets, setSecrets] = useState({})
  const refreshSecrets = useCallback(
    () =>
      api.settings
        .secretsStatus()
        .then(setSecrets)
        .catch(() => {}),
    []
  )
  useEffect(() => void refreshSecrets(), [refreshSecrets])

  const body = {
    general: <General />,
    suggestions: <Suggestions secrets={secrets} refreshSecrets={refreshSecrets} />,
    actions: <Actions />,
    calendar: <Calendar secrets={secrets} refreshSecrets={refreshSecrets} />,
    capture: <Capture />,
    search: <Search />,
    privacy: <Privacy />,
    permissions: <Permissions />,
    about: <About />
  }[section]

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <button className={styles.back} onClick={() => useStore.getState().closeSettings()}>
          ← Back
        </button>
        <h2>Settings</h2>
        <span className={styles.rowDesc}>⌘, to close</span>
      </div>
      <div className={styles.layout}>
        <nav className={styles.nav} aria-label="Settings sections">
          {SECTIONS.map(([id, name]) => (
            <button
              key={id}
              className={styles.navItem}
              aria-current={section === id}
              onClick={() => useStore.setState({ settingsSection: id })}
            >
              {name}
            </button>
          ))}
        </nav>
        <div className={styles.content}>{body}</div>
      </div>
    </div>
  )
}

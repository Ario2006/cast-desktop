import { useCallback, useEffect, useState } from 'react'
import { ACTIONS } from '@shared/actionRegistry'
import { AI_PROVIDERS } from '@shared/settings'
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
import Icon from './Icon'
import styles from './settings.module.css'

const SECTIONS = [
  ['general', 'General'],
  ['suggestions', 'Suggestions'],
  ['actions', 'Actions'],
  ['calendar', 'Calendar'],
  ['capture', 'Capture'],
  ['search', 'Search'],
  ['developer', 'Developer'],
  ['quicklinks', 'Quicklinks'],
  ['integrations', 'Integrations'],
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
      <ToggleRow
        settingKey="trayTimerTitle"
        label="Show timer in menu bar"
        desc="Remaining / elapsed time next to the icon."
      />
      <SelectRow
        settingKey="trayDisplay"
        label="Menu bar when idle"
        desc="What to show next to the icon when no timer is running."
        options={[
          ['timer', 'Nothing'],
          ['meeting', 'Next meeting'],
          ['weather', 'Weather'],
          ['none', 'Nothing, ever']
        ]}
      />
      <SectionTitle>Appearance</SectionTitle>
      <SelectRow
        settingKey="theme"
        label="Theme"
        options={[
          ['light', 'Light'],
          ['dark', 'Dark'],
          ['system', 'Match macOS']
        ]}
      />
      <SelectRow
        settingKey="textSize"
        label="Text size"
        options={[
          ['small', 'Small'],
          ['normal', 'Default'],
          ['large', 'Large']
        ]}
      />
      <ToggleRow
        settingKey="highContrast"
        label="Increase contrast"
        desc="Stronger text, borders and focus rings."
      />
      <SectionTitle>Weather</SectionTitle>
      <TextRow
        settingKey="weatherLocation"
        label="Your city"
        desc="Used for “weather” with no place. Empty = guess from your time zone."
        placeholder="e.g. Bengaluru"
      />
      <SelectRow
        settingKey="temperatureUnit"
        label="Temperature"
        options={[
          ['celsius', 'Celsius'],
          ['fahrenheit', 'Fahrenheit']
        ]}
      />
    </>
  )
}

/** A folder path with a native "Choose…" picker. */
function FolderRow({ settingKey, label, desc }) {
  const [value, set, error] = useSetting(settingKey)
  return (
    <Row label={label} desc={value ? `${desc ? `${desc} · ` : ''}${value}` : desc} error={error}>
      <button
        className={styles.btn}
        onClick={async () => {
          const dir = await api.data.pickFolder(label)
          if (dir) set(dir)
        }}
      >
        Choose…
      </button>
    </Row>
  )
}

function ProjectFolders() {
  const [folders, set, error] = useSetting('projectFolders')
  return (
    <>
      <Row
        label="Project folders"
        desc="Cast finds git repositories up to 3 levels inside these."
        error={error}
      >
        <button
          className={styles.btn}
          onClick={async () => {
            const dir = await api.data.pickFolder('Add a project folder')
            if (dir && !folders.includes(dir)) set([...folders, dir])
          }}
        >
          Add…
        </button>
      </Row>
      {folders.map((f) => (
        <Row key={f} label={<span className={styles.mono}>{f}</span>}>
          <button
            className={styles.btn}
            aria-label={`Remove ${f}`}
            onClick={() => set(folders.filter((x) => x !== f))}
          >
            Remove
          </button>
        </Row>
      ))}
    </>
  )
}

function Developer() {
  const scriptsEnabled = useStore((s) => s.settings.scriptsEnabled)
  return (
    <>
      <ProjectFolders />
      <SelectRow
        settingKey="projectEditor"
        label="Open projects in"
        desc="↵ opens in this app, ⌘↵ in your terminal."
        options={[
          ['vscode', 'Visual Studio Code'],
          ['cursor', 'Cursor'],
          ['zed', 'Zed'],
          ['sublime', 'Sublime Text'],
          ['webstorm', 'WebStorm'],
          ['xcode', 'Xcode'],
          ['finder', 'Finder']
        ]}
      />
      <SelectRow
        settingKey="terminalApp"
        label="Terminal"
        options={[
          ['terminal', 'Terminal'],
          ['iterm', 'iTerm'],
          ['warp', 'Warp'],
          ['ghostty', 'Ghostty']
        ]}
      />
      <TextRow settingKey="remBase" label="Root font size for px to rem" number narrow />
      <SectionTitle>Script commands</SectionTitle>
      <ToggleRow
        settingKey="scriptsEnabled"
        label="Enable script commands"
        desc="Run executable scripts from one folder. Add “# @cast.title Name” to a script to name it."
      />
      {scriptsEnabled && (
        <>
          <FolderRow settingKey="scriptsFolder" label="Scripts folder" />
          <Row label="Open scripts folder" desc="An example script is created the first time.">
            <button className={styles.btn} onClick={() => api.dev.openScriptsFolder()}>
              Open
            </button>
          </Row>
        </>
      )}
    </>
  )
}

function Quicklinks() {
  const [links, setLinks] = useState([])
  const [draft, setDraft] = useState({ keyword: '', name: '', url: '' })
  const [error, setError] = useState(null)
  const load = useCallback(
    () =>
      api.quicklinks
        .list()
        .then(setLinks)
        .catch(() => {}),
    []
  )
  useEffect(() => void load(), [load])
  const add = async () => {
    setError(null)
    try {
      await api.quicklinks.create({
        keyword: draft.keyword.trim(),
        name: draft.name.trim() || draft.keyword.trim(),
        url: draft.url.trim()
      })
      setDraft({ keyword: '', name: '', url: '' })
      load()
      useStore.getState().loadQuicklinks()
    } catch (e) {
      setError(e.message)
    }
  }
  return (
    <>
      <Row
        label="Your quicklinks"
        desc="Type the keyword, optionally followed by text that replaces {query} in the URL."
      />
      {links.map((l) => (
        <Row key={l.id} label={`${l.keyword} — ${l.name}`} desc={l.url}>
          <button
            className={`${styles.btn} ${styles.btnDanger}`}
            onClick={async () => {
              await api.quicklinks.delete(l.id)
              load()
              useStore.getState().loadQuicklinks()
              useStore.getState().showToast('Quicklink deleted', 'info', 6000, {
                label: 'Undo',
                run: async () => {
                  await api.quicklinks.create({ keyword: l.keyword, name: l.name, url: l.url })
                  load()
                  useStore.getState().loadQuicklinks()
                }
              })
            }}
          >
            Delete
          </button>
        </Row>
      ))}
      <SectionTitle>Add a quicklink</SectionTitle>
      <div className={styles.row} style={{ gap: 8, flexWrap: 'wrap' }}>
        <input
          className={`${styles.input} ${styles.narrow}`}
          placeholder="jira"
          aria-label="Keyword"
          value={draft.keyword}
          onChange={(e) => setDraft({ ...draft, keyword: e.target.value })}
        />
        <input
          className={styles.input}
          style={{ width: 130 }}
          placeholder="Name"
          aria-label="Name"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
        <input
          className={styles.input}
          style={{ flex: 1, minWidth: 220 }}
          placeholder="https://jira.acme.com/browse/{query}"
          aria-label="URL"
          value={draft.url}
          onChange={(e) => setDraft({ ...draft, url: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={add}
          disabled={!draft.keyword.trim() || !draft.url.trim()}
        >
          Add
        </button>
      </div>
      {error && <div className={styles.rowError}>{error}</div>}
    </>
  )
}

function Integrations({ secrets, refreshSecrets }) {
  return (
    <>
      <SelectRow
        settingKey="captureDefault"
        label="Default capture destination"
        desc="Used by the “Send to…” action from notes."
        options={[
          ['notes', 'Apple Notes'],
          ['obsidian', 'Obsidian'],
          ['notion', 'Notion']
        ]}
      />
      <SectionTitle>Obsidian</SectionTitle>
      <FolderRow settingKey="obsidianVault" label="Vault folder" />
      <TextRow
        settingKey="obsidianInboxNote"
        label="Inbox note"
        desc="Captures are appended to this note."
      />
      <SectionTitle>Notion</SectionTitle>
      <SecretRow
        name="notionToken"
        label="Integration token"
        desc="Create an internal integration at notion.so/my-integrations, then share your page with it."
        placeholder="secret_…"
        configured={secrets.notionToken}
        onChanged={refreshSecrets}
      />
      <TextRow
        settingKey="notionPageId"
        label="Page"
        desc="Paste the page’s link or ID."
        placeholder="https://www.notion.so/…"
      />
      <SectionTitle>Focus mode</SectionTitle>
      <TextRow
        settingKey="focusShortcutOn"
        label="Shortcut to run when focus starts"
        desc="Name of a macOS Shortcut, e.g. one that turns on a Focus. Runs at each Pomodoro focus block."
        placeholder="Focus On"
      />
      <TextRow
        settingKey="focusShortcutOff"
        label="Shortcut to run on breaks"
        placeholder="Focus Off"
      />
    </>
  )
}

/** Switching provider also resets Base URL / Model to that provider's defaults. */
function ProviderRow() {
  const [value, , error] = useSetting('aiProvider')
  const change = async (next) => {
    const d = AI_PROVIDERS[next]
    const st = useStore.getState()
    await st.setSetting('aiProvider', next)
    await st.setSetting('aiBaseUrl', d.baseUrl)
    await st.setSetting('aiModel', d.model)
  }
  return (
    <Row
      label="Provider"
      desc={
        value === 'openjev'
          ? 'A classifier: picks the best tool as you type; Cast fills in the details locally.'
          : 'Any OpenAI-compatible chat endpoint (OpenAI, OpenRouter, Ollama, LM Studio…).'
      }
      error={error}
    >
      <select className={styles.select} value={value} onChange={(e) => change(e.target.value)}>
        {Object.entries(AI_PROVIDERS).map(([id, p]) => (
          <option key={id} value={id}>
            {p.name}
          </option>
        ))}
      </select>
    </Row>
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
        desc="Sends what you type (nothing else) to your AI provider so Cast can suggest the best tool."
      />
      <SectionTitle>AI provider</SectionTitle>
      <ProviderRow />
      <TextRow settingKey="aiBaseUrl" label="Base URL" />
      <TextRow settingKey="aiModel" label="Model" />
      <SecretRow
        name="aiApiKey"
        label="API key"
        desc="Encrypted with the macOS Keychain. Never shown again."
        placeholder="Paste your API key"
        configured={secrets.aiApiKey}
        onChanged={refreshSecrets}
      />
      <Row label="Test connection" error={test && !test.ok ? test.message : null}>
        {test?.ok && (
          <span className={styles.result} data-ok="true">
            <Icon name="check" size={13} strokeWidth={2.6} /> {test.message}
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
      <ToggleRow
        settingKey="learnFromChoices"
        label="Learn from my choices"
        desc="Ranks the action you usually pick for similar input higher. Stores only a coarse pattern (like “remind me”), never what you typed."
      />
      <ToggleRow
        settingKey="aiCustomLabels"
        label="Let AI pick my quicklinks, scripts and Shortcuts"
        desc="Sends their names (not their URLs or contents) to the classifier so it can suggest them."
      />
    </>
  )
}

function Actions() {
  const [disabled, setDisabled] = useSetting('disabledActions')
  const [favorites, setFavorites] = useSetting('favorites')
  const toggle = (list, id) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  return (
    <>
      <ToggleRow
        settingKey="taskReminders"
        label="Remind me when tasks are due"
        desc="A task with a due time also gets a reminder notification."
      />
      <SelectRow
        settingKey="timerSound"
        label="Alert sound"
        desc="Plays when a timer, Pomodoro phase or reminder goes off."
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
      <SectionTitle>Pomodoro</SectionTitle>
      <TextRow settingKey="pomodoroFocusMinutes" label="Focus (minutes)" number narrow />
      <TextRow settingKey="pomodoroShortBreakMinutes" label="Short break (minutes)" number narrow />
      <TextRow settingKey="pomodoroLongBreakMinutes" label="Long break (minutes)" number narrow />
      <TextRow settingKey="pomodoroCycles" label="Rounds before the long break" number narrow />
      <SectionTitle>Clipboard</SectionTitle>
      <ToggleRow
        settingKey="clipboardHistory"
        label="Keep clipboard history"
        desc="Remembers your last 50 copied texts in memory only (nothing is saved, it clears when you quit). Items copied from password managers are skipped."
      />
      <SectionTitle>Actions</SectionTitle>
      {ACTIONS.filter(
        (a) => !['record.stop', 'snippet.copy', 'currency.convert'].includes(a.id)
      ).map((a) => (
        <Row key={a.id} label={a.title} desc={a.description}>
          <button
            className={styles.star}
            aria-pressed={favorites.includes(a.id)}
            aria-label={`Pin ${a.title} as a favorite`}
            title="Pin as favorite"
            onClick={() => setFavorites(toggle(favorites, a.id))}
          >
            <Icon name="star" size={17} fill={favorites.includes(a.id) ? 'currentColor' : 'none'} />
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
        desc="Click Connect, sign in with Google in your browser, and you're done. Your session is stored encrypted in the macOS Keychain."
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
      <details className={styles.advanced} open={!secrets.googleBuiltin}>
        <summary>
          {secrets.googleBuiltin ? 'Advanced: use your own Google client' : 'Google client setup'}
        </summary>
        {!secrets.googleBuiltin && (
          <p className={styles.rowDesc} style={{ margin: '4px 2px 8px' }}>
            This build has no built-in Google sign-in. Create a Desktop-type OAuth client in Google
            Cloud Console (Calendar API enabled) and paste it here. A packaged release can include
            one so users just click Connect.
          </p>
        )}
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
      </details>
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
      <SelectRow
        settingKey="screenshotAfter"
        label="After a screenshot"
        desc="“Open in Preview” lets you crop and mark it up."
        options={[
          ['none', 'Do nothing'],
          ['preview', 'Open in Preview']
        ]}
      />
      <TextRow settingKey="recordingFolder" label="Recording folder" />
      <SelectRow
        settingKey="recordingFormat"
        label="Recording format"
        desc="MP4 plays everywhere (converted after you stop). WebM is kept as-is."
        options={[
          ['mp4', 'MP4'],
          ['webm', 'WebM']
        ]}
      />
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
      <Row
        label="Clear learned preferences"
        desc="Forgets which actions you usually pick for each kind of input."
      >
        <ConfirmButton
          label="Clear"
          onConfirm={async () => (
            await api.history.clearLearned(),
            useStore.getState().refreshHistory(),
            toast('Learned preferences cleared')
          )}
        />
      </Row>
      <Row label="Clear clipboard history">
        <ConfirmButton
          label="Clear"
          onConfirm={async () => (await api.clipboard.clear(), toast('Clipboard history cleared'))}
        />
      </Row>
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
      <DataTransfer />
    </>
  )
}

/** Move notes, snippets, quicklinks, tasks and settings between Macs (never API keys or tokens). */
function DataTransfer() {
  const [passphrase, setPassphrase] = useState('')
  const [msg, setMsg] = useState(null)
  const run = async (fn) => {
    setMsg(null)
    try {
      setMsg(await fn())
    } catch (e) {
      setMsg({ error: e.message })
    }
  }
  return (
    <>
      <SectionTitle>Move to another Mac</SectionTitle>
      <Row
        label="Passphrase"
        desc="Optional. Encrypts the export (AES-256); needed again to import it."
      >
        <input
          type="password"
          className={styles.input}
          value={passphrase}
          autoComplete="new-password"
          placeholder="Leave empty for no encryption"
          aria-label="Export passphrase"
          onChange={(e) => setPassphrase(e.target.value)}
        />
      </Row>
      <Row
        label="Export"
        desc="Notes, snippets, quicklinks, tasks and settings. API keys and tokens are never included."
        error={msg?.error}
      >
        {msg?.path && !msg.counts && (
          <span className={styles.badge} data-ok="true">
            Saved
          </span>
        )}
        <button
          className={styles.btn}
          onClick={() => run(() => api.data.export(passphrase || undefined))}
        >
          Export…
        </button>
      </Row>
      <Row
        label="Import"
        desc={
          msg?.counts
            ? `Imported ${msg.counts.notes} notes, ${msg.counts.snippets} snippets, ${msg.counts.quicklinks} quicklinks, ${msg.counts.tasks} tasks and ${msg.counts.settings} settings.`
            : 'Merges into what you have; nothing is overwritten.'
        }
      >
        <button
          className={styles.btn}
          onClick={() =>
            run(async () => {
              const r = await api.data.import(passphrase || undefined)
              if (r.counts) useStore.getState().loadQuicklinks()
              return r
            })
          }
        >
          Import…
        </button>
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
      {row('accessibility', 'Accessibility', 'Needed for window layouts (left half, maximize…).')}
      <Row
        label="Automation"
        desc="macOS asks the first time Cast controls Notes, Contacts, Finder or System Events."
      >
        <button className={styles.btn} onClick={() => api.permissions.open('automation')}>
          Open System Settings
        </button>
      </Row>
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
  const [showLogs, setShowLogs] = useState(false)
  const [logs, setLogs] = useState('')
  useEffect(() => {
    if (showLogs)
      api.app
        .logs()
        .then(setLogs)
        .catch(() => setLogs('Could not read the log.'))
  }, [showLogs])
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
      <Row
        label="Copy diagnostics"
        desc="Versions, settings and recent log for a bug report. No keys, no typed text."
      >
        <button
          className={styles.btn}
          onClick={async () => {
            await api.data.diagnostics()
            useStore.getState().showToast('Diagnostics copied', 'success', 1500)
          }}
        >
          Copy
        </button>
      </Row>
      <Row label="Data folder" desc={info?.dataDir}>
        <button className={styles.btn} onClick={() => api.app.openPath('data')}>
          Open
        </button>
      </Row>
      <Row label="Logs" desc="Rotating log file (no queries or secrets).">
        <button className={styles.btn} onClick={() => setShowLogs((v) => !v)}>
          {showLogs ? 'Hide' : 'View'}
        </button>
        <button className={styles.btn} onClick={() => api.app.openPath('logs')}>
          Reveal
        </button>
      </Row>
      {showLogs && <pre className={styles.logs}>{logs || 'No log entries yet.'}</pre>}
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
    developer: <Developer />,
    quicklinks: <Quicklinks />,
    integrations: <Integrations secrets={secrets} refreshSecrets={refreshSecrets} />,
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

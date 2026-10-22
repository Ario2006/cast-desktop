# Cast — Application Specification

**Version:** 0.1 (draft)
**Platform:** macOS (personal use)
**Stack:** Electron · React · JavaScript · SQLite
**Status:** Pre-development

---

## 1. Overview

**Cast** is a lightweight, Spotlight/Raycast-style launcher widget for macOS. The user summons it with a global keyboard shortcut, starts typing, and Cast suggests relevant actions in real time: set a timer, start a stopwatch, book a calendar event, capture the screen, jot a note, convert units, and more. Selecting a suggestion runs the action and, where relevant, shows a small interactive widget **inside the same launcher window**.

An AI model interprets free-form input (e.g. "remind me to call mom tomorrow at 5") and maps it to structured actions with pre-filled parameters. Fast local matching handles the obvious cases instantly, so Cast feels responsive even without a network.

### 1.1 Goals

- Open instantly (< 150 ms from shortcut to focused input).
- Suggest the right action as the user types, whether they type a command name or a natural-language request.
- Execute most tasks in two keystrokes after the query (arrow/Enter).
- Run entirely locally except for AI calls and Google Calendar.
- Stay simple: one window, one input, one results/widget area.

### 1.2 Non-Goals (v1)

- Windows/Linux support.
- Mac App Store distribution, code signing, notarization.
- Plugin/extension marketplace.
- Cloud sync or multi-device support.
- Multi-user accounts.
- A full chat-assistant experience (Cast executes actions; it is not a chatbot).

### 1.3 Target User

A single user (the developer) who wants a fast, keyboard-driven productivity tool on their Mac.

---

## 2. Tech Stack

| Concern | Choice | Notes |
|---|---|---|
| Shell | **Electron** (latest stable) | Main + preload + renderer architecture |
| Language | **JavaScript** (ES2022, ESM in renderer, CommonJS or ESM in main) | JSDoc type annotations encouraged |
| UI | **React 18+** | Function components + hooks |
| Bundler | **Vite** + `vite-plugin-electron` (or electron-vite) | Fast HMR for renderer |
| State | **Zustand** | Small store for query, suggestions, active widget |
| Styling | **CSS Modules** or **Tailwind CSS** | Dark/light via `prefers-color-scheme` |
| Database | **better-sqlite3** | Synchronous, fast, main process only |
| Fuzzy search | **Fuse.js** | Local command matching |
| NL date/time parsing | **chrono-node** | "tomorrow at 5pm", "in 20 minutes" |
| Math | **mathjs** | Safe expression evaluation (no `eval`) |
| Units | **mathjs units** (or `convert-units`) | Length, mass, temp, volume, etc. |
| Google Calendar | **googleapis** (`@googleapis/calendar`) + OAuth 2.0 | Desktop-app flow with PKCE |
| Secrets | Electron **`safeStorage`** | Encrypts API keys/tokens using macOS Keychain |
| Packaging | **electron-builder** or **electron-forge** | Unsigned `.app` for personal use |
| Testing | **Vitest** (unit), **Playwright for Electron** (e2e, optional) | |
| Lint/format | ESLint + Prettier | |

---

## 3. Architecture

### 3.1 Process Model

```
┌───────────────────────────── Main Process ─────────────────────────────┐
│  App lifecycle · Tray · Global shortcut · Window manager               │
│  SQLite (better-sqlite3) · Scheduler (timers/reminders)                │
│  Action executors (fs, shell, capture, calendar) · AI client           │
│  Notifications · Settings store · Secrets (safeStorage)                │
└───────────────▲────────────────────────────────────────────────────────┘
                │  IPC (validated, whitelisted channels via preload)
┌───────────────┴────────────── Preload Script ──────────────────────────┐
│  contextBridge exposes `window.cast` API only                          │
└───────────────▲────────────────────────────────────────────────────────┘
                │
┌───────────────┴───────────── Renderer (React) ────────────────────────┐
│  Search input · Suggestion list · Widget panel · Settings view         │
│  No Node access. No direct fs/network (except what preload exposes).   │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Key Principles

- **Security first:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. The renderer talks to the main process only through typed, validated IPC.
- **Main process owns state that must outlive the window:** timers, stopwatches, reminders, and recordings keep running when the launcher is hidden.
- **Actions are modular:** each action is a self-contained module registered in an action registry (see §5).
- **AI is optional:** if the AI call fails, is slow, or is disabled, local matching still works.

### 3.3 Suggested Project Structure

```
cast/
├─ package.json
├─ electron.vite.config.js
├─ resources/                 # tray icons (template images), app icon
├─ src/
│  ├─ main/
│  │  ├─ index.js             # app entry, lifecycle
│  │  ├─ windows.js           # launcher + settings window creation
│  │  ├─ tray.js
│  │  ├─ shortcuts.js
│  │  ├─ ipc/                 # one file per IPC domain
│  │  ├─ db/
│  │  │  ├─ index.js          # connection + migrations runner
│  │  │  └─ migrations/
│  │  ├─ ai/
│  │  │  ├─ provider.js       # provider interface
│  │  │  └─ providers/        # concrete provider(s)
│  │  ├─ scheduler.js         # timers, reminders, notifications
│  │  ├─ google/              # oauth + calendar client
│  │  └─ actions/             # executors per action (main-side logic)
│  ├─ preload/
│  │  └─ index.js
│  ├─ renderer/
│  │  ├─ index.html
│  │  ├─ main.jsx
│  │  ├─ App.jsx
│  │  ├─ store/
│  │  ├─ components/          # SearchInput, SuggestionList, WidgetHost...
│  │  ├─ widgets/             # TimerWidget, StopwatchWidget, NoteWidget...
│  │  └─ styles/
│  └─ shared/
│     ├─ actionRegistry.js    # action definitions (id, triggers, schema)
│     ├─ intents.js           # intent schema + validators
│     └─ constants.js
└─ tests/
```

---

## 4. User Experience

### 4.1 Core Flow

1. User presses the **global shortcut** (default `⌥ Space`, configurable).
2. Launcher window appears centered in the upper third of the active display, input focused.
3. User types. Suggestions update live (local results immediately, AI results merged in when they arrive).
4. User navigates with `↑ / ↓`, confirms with `Enter`.
5. Depending on the action:
   - **Instant actions** (screenshot, open file, web search): execute, then hide the window.
   - **Widget actions** (timer, note, calculator result, calendar form): the suggestion list is replaced by a **widget panel in the same window**.
6. `Esc` goes back one level (widget → suggestions → hide window). Clicking outside hides the window (configurable).

### 4.2 Window Specification

| Property | Value |
|---|---|
| Type | Frameless, `transparent: true` with rounded container |
| Size | Width 680 px; height auto-grows (input 56 px + content up to ~420 px) |
| Position | Centered horizontally, ~20% from top of the display containing the cursor |
| Always on top | Yes (`floating` level), visible on all workspaces / over full-screen apps |
| Resizable / movable | Not resizable; draggable by input bar (optional) |
| Hide on blur | Default on |
| Vibrancy | macOS `under-window` or `hud` vibrancy for native feel |
| Dock icon | Hidden (`app.dock.hide()` / `LSUIElement`) |
| Animation | 120 ms fade/scale in; 80 ms out. Respect "Reduce motion" |

### 4.3 UI Regions

1. **Input bar** — large text field, placeholder: *"What do you want to do?"*; a small mode chip appears when an action is "locked in" (e.g. `Timer`).
2. **Suggestion list** — up to 7 rows. Each row: icon, title, subtitle/preview (e.g. "Set timer — 25 min"), keyboard hint.
3. **Widget panel** — replaces the list when an action is active. Contains the action's interactive UI.
4. **Footer hint bar** — contextual hints (`↵ Run   ⎋ Back   ⌘, Settings`).

### 4.4 Keyboard Map

| Key | Behavior |
|---|---|
| Global shortcut | Toggle launcher |
| `↑` / `↓` | Move selection |
| `Enter` | Run selected suggestion |
| `Tab` | Autocomplete the selected suggestion into the input / advance widget field |
| `Esc` | Back / clear / hide |
| `⌘ ,` | Open Settings |
| `⌘ 1…7` | Run the Nth suggestion |
| `⌘ C` on result | Copy result (calculator, conversion) |

### 4.5 Menu Bar (Tray)

- Template icon (monochrome, auto light/dark).
- Left-click: toggle launcher.
- Menu items: **Open Cast**, **Active timers** (live list with remaining time), **Stop recording** (visible only while recording), **Settings…**, **Check permissions**, **Quit Cast**.
- While a timer or stopwatch is running, the tray title can optionally show the remaining/elapsed time (e.g. `04:32`).

### 4.6 Empty & Error States

- **Empty input:** show recent actions + pinned favorites (max 5), or a short tip.
- **No matches:** fall back to "Search the web for '…'" and "Ask AI" (if enabled).
- **AI unavailable:** subtle inline notice ("Smart suggestions offline") — local results still shown.
- **Permission missing:** actionable card ("Screen Recording permission required → Open System Settings").

---

## 5. Suggestion Engine

### 5.1 Two-Tier Strategy

**Tier 1 — Local (synchronous, < 20 ms):**
- Fuse.js fuzzy match against each action's `title`, `keywords`, and `aliases`.
- Deterministic pattern parsers run in parallel:
  - **Math:** input looks like an expression → show result row.
  - **Units:** `10 km to miles`, `72f in c` → show conversion row.
  - **Time expressions:** `25m`, `timer 10 min`, `in 1 hour` → timer row with parsed duration (chrono-node + custom duration regex).
  - **Paths/URLs:** `~/Documents/...`, `https://...` → open row.
- Results are scored and shown immediately.

**Tier 2 — AI intent classification (async, debounced ~250–350 ms, cancel on keystroke):**
- Sends the current input (and minimal context: current datetime, timezone, locale, list of enabled action IDs) to the AI provider.
- Model returns **strict JSON** matching the intent schema (§5.3).
- Results are validated against the schema, then merged with Tier 1 results, de-duplicated by `(actionId, params)`, and re-ranked.
- Skipped when: input < 3 chars, input fully handled by a deterministic parser with high confidence, AI is disabled, or offline.

### 5.2 Ranking

Score = `0.5 × matchScore + 0.3 × aiConfidence + 0.1 × recencyBoost + 0.1 × frequencyBoost`
(tunable constants; AI term is 0 when unavailable). Ties broken by action priority. Max 7 suggestions displayed.

### 5.3 Intent Schema (AI Output Contract)

```json
{
  "intents": [
    {
      "actionId": "timer.start",
      "confidence": 0.93,
      "params": { "durationSeconds": 1500, "label": "Focus" },
      "title": "Start 25-minute timer",
      "subtitle": "Label: Focus"
    }
  ]
}
```

Rules:
- `actionId` must exist in the action registry; unknown IDs are dropped.
- `params` validated per-action with a schema (e.g. Zod or hand-written validators).
- Max 4 intents per response.
- The prompt instructs the model to output JSON only, no prose.

### 5.4 Privacy of AI Calls

- Only the typed query + minimal context is sent. No file contents, no clipboard, no calendar data (unless the user explicitly invokes a feature that needs it).
- A setting "Enable smart suggestions" toggles Tier 2 entirely.
- Queries are not logged to disk unless "Keep action history" is enabled (and then only the final chosen action, not raw keystrokes).

---

## 6. Action Catalog

Each action is defined in `shared/actionRegistry.js`:

```js
{
  id: 'timer.start',
  title: 'Start timer',
  keywords: ['timer', 'countdown', 'remind in'],
  icon: 'timer',
  kind: 'widget',            // 'instant' | 'widget'
  paramsSchema: {...},
  parse: (input) => params | null,   // optional local parser
}
```

### 6.1 v1 Actions

#### 1. Timer
- **Triggers:** "timer", "25m", "countdown", "in 10 minutes", NL ("timer for 5 min pasta").
- **Params:** `durationSeconds`, `label?`.
- **Widget:** large countdown, pause/resume, reset, add +1 min, label edit.
- **Behavior:** runs in the main-process scheduler; survives window hide. On completion: native notification + sound (configurable) + tray flash.
- **Multiple timers:** supported (list in tray menu and in a "Running" section when the launcher is opened with empty input).
- **Persistence:** active timers stored in SQLite so they survive app restart (recomputed from absolute end time).

#### 2. Stopwatch
- **Triggers:** "stopwatch", "start stopwatch", "lap".
- **Widget:** elapsed time (centiseconds), start/pause, lap, reset; lap list.
- **Behavior:** same persistence model as timers (store `startedAt`, `accumulatedMs`).

#### 3. Calendar Event (Google Calendar)
- **Triggers:** "book", "schedule", "meeting", "appointment", "event", NL ("dentist friday 3pm for 1 hour").
- **Params:** `title`, `start`, `end` or `durationMinutes`, `location?`, `description?`, `attendees?`, `calendarId?`, `addMeetLink?`.
- **Widget:** pre-filled form (title, date, start/end, calendar picker, optional location/attendees, Meet toggle). `Enter` or `⌘↵` creates the event.
- **Behavior:** parsed with chrono-node (+ AI for ambiguity). After creation: toast with "Open in Google Calendar" link and "Undo" (deletes event, 10 s window).
- **Auth:** Google OAuth 2.0 (see §8.2). Scope: `https://www.googleapis.com/auth/calendar.events`.
- **Edge cases:** conflicts (show a warning if an overlapping event exists — read via `events.list` for the time range), missing end time (default 30 min, configurable), timezone handling (use system timezone; show it in the form).

#### 4. Screenshot
- **Triggers:** "screenshot", "capture screen", "snap".
- **Variants (as separate suggestions):** Full screen · Selected area · Window.
- **Behavior:** launcher hides first (so it isn't captured), short delay (~150 ms), capture, save to configured folder (default `~/Pictures/Cast`), copy to clipboard (optional), show notification with "Reveal in Finder".
- **Implementation:** use macOS `screencapture` CLI (`-i` for area, `-w` for window, `-x` silent) for reliability, or `desktopCapturer` for full screen.
- **Permission:** requires macOS **Screen Recording** permission.

#### 5. Screen Recording
- **Triggers:** "record screen", "screen recording", "capture video".
- **Options:** full screen / selected display; audio on/off (system audio limited by macOS; microphone optional).
- **Behavior:** launcher hides; recording indicator in tray (red dot + elapsed time); stop via tray menu or global stop shortcut (default `⌥⇧ Space`). Output saved as `.mp4`/`.webm` to `~/Movies/Cast`.
- **Implementation:** `desktopCapturer` + `MediaRecorder` in a hidden renderer window; stream chunks to main process for writing; optional ffmpeg remux to mp4 (bundled `ffmpeg-static`) — can be deferred to v1.1.
- **Permission:** Screen Recording (+ Microphone if enabled).

#### 6. Quick Notes
- **Triggers:** "note", "jot", "remember that…", `n:` prefix.
- **Widget:** multi-line text area with auto-save; `⌘↵` saves & closes. Optional title/tags.
- **Also:** "Search notes" action → searches note content (SQLite FTS5) and lists results; selecting opens the note in the widget.
- **Storage:** SQLite `notes` table.

#### 7. Reminders
- **Triggers:** "remind me to …", "reminder", NL ("remind me to stretch in 30 min").
- **Params:** `text`, `remindAt`, `repeat?` (none/daily/weekly).
- **Behavior:** scheduled in main process; native notification at due time with "Snooze 10 min" and "Done" actions; persisted in SQLite; missed reminders (app was closed) fire on next launch with a "missed" label.
- **Widget:** small confirmation card showing the parsed time with edit capability.

#### 8. Calculator
- **Triggers:** input is a math expression (`12*(3+4)`, `15% of 240`, `sqrt(81)`).
- **Behavior:** live result row; `Enter` copies result. Uses mathjs in a restricted scope (no `import`, `evaluate` with limited functions). History of last 20 results (optional).

#### 9. Unit & Currency Conversion
- **Triggers:** `5 miles in km`, `100 f to c`, `2 cups to ml`.
- **Behavior:** live result row; `Enter` copies. Currency conversion is **v1.1** (requires a rates source; see §13).

#### 10. File Launcher
- **Triggers:** "open …", file name fragments, `~/` or `/` paths.
- **Behavior:** search via macOS **Spotlight index** (`mdfind -name <query>`) limited to user directories; show top 5 with icon/path; `Enter` opens (`shell.openPath`), `⌘Enter` reveals in Finder.
- **Also:** "Open app" — launch applications by name (`/Applications`, `~/Applications`, via `mdfind kMDItemKind == 'Application'`).
- **Safety:** never executes files directly via shell; uses `shell.openPath`.

#### 11. Web Search
- **Triggers:** always available as a fallback row: *Search the web for "…"*; explicit prefixes (`g `, `ddg `, `yt `).
- **Behavior:** opens default browser with configured search engine (default Google; options: DuckDuckGo, Brave, Kagi, custom URL template with `{query}`).
- **Quick URL:** if input looks like a URL, offer "Open URL".

### 6.2 Suggested Additional Actions (v1.1+ backlog)

| Action | Description |
|---|---|
| **Pomodoro** | Focus/break cycles with configurable lengths; builds on timer |
| **Clipboard history** | Last ~50 text items; search & paste (requires Accessibility permission for auto-paste) |
| **Snippets / text expansion** | Saved snippets, copy to clipboard on select |
| **World clock / timezone convert** | "3pm PST in IST", "time in Tokyo" |
| **Currency conversion** | Live rates via a free API, cached offline |
| **Color picker** | Eyedropper (Electron `EyeDropper` API) → copies HEX/RGB |
| **Dictionary / define** | Uses macOS `DCSCopyTextDefinition` or a web API |
| **Translate** | Via AI provider |
| **System commands** | Lock screen, sleep, toggle dark mode, empty trash, DND |
| **Quick AI answer** | One-shot answer card (not a chat) |
| **Window layout** | Snap windows left/right/center (needs Accessibility permission) |
| **Emoji picker** | Search & copy |
| **Daily agenda** | Show today's Google Calendar events |
| **QR code** | Generate QR from text/clipboard |
| **Password/UUID generator** | Generate & copy |
| **Text transforms** | Upper/lower/slug/base64/JSON-format clipboard text |

---

## 7. Data Model (SQLite)

Database file: `~/Library/Application Support/Cast/cast.db`
Migrations: simple versioned SQL files executed on startup (`PRAGMA user_version`). Use `PRAGMA journal_mode = WAL`.

```sql
-- Key/value settings (non-secret)
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL            -- JSON-encoded
);

-- Timers and stopwatches share one table
CREATE TABLE timers (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  kind             TEXT NOT NULL CHECK (kind IN ('timer','stopwatch')),
  label            TEXT,
  duration_ms      INTEGER,          -- timers only
  started_at       INTEGER,          -- epoch ms (null if paused/not started)
  accumulated_ms   INTEGER NOT NULL DEFAULT 0,
  state            TEXT NOT NULL CHECK (state IN ('running','paused','done','cancelled')),
  laps_json        TEXT,             -- stopwatch laps
  created_at       INTEGER NOT NULL
);

CREATE TABLE notes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT,
  body        TEXT NOT NULL,
  pinned      INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE VIRTUAL TABLE notes_fts USING fts5(title, body, content='notes', content_rowid='id');
-- + triggers to keep notes_fts in sync

CREATE TABLE reminders (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  text        TEXT NOT NULL,
  remind_at   INTEGER NOT NULL,      -- epoch ms
  repeat      TEXT,                  -- null | 'daily' | 'weekly'
  state       TEXT NOT NULL CHECK (state IN ('pending','fired','done','snoozed')),
  created_at  INTEGER NOT NULL
);

-- Optional: powers "recent" and frequency ranking. Stores no raw keystrokes.
CREATE TABLE action_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  action_id   TEXT NOT NULL,
  summary     TEXT,                  -- e.g. "Timer 25m"
  used_at     INTEGER NOT NULL
);
CREATE INDEX idx_history_action ON action_history(action_id, used_at DESC);

-- Captures metadata (files live on disk)
CREATE TABLE captures (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL CHECK (kind IN ('screenshot','recording')),
  path        TEXT NOT NULL,
  duration_ms INTEGER,
  created_at  INTEGER NOT NULL
);
```

**Secrets are never stored in SQLite.** API keys and Google tokens are encrypted with Electron `safeStorage` and written to a separate file (`secrets.bin`) in the app data directory.

---

## 8. Integrations

### 8.1 AI Provider

> **Open item:** The brief referenced "Openjev" and the "codiv API." These need confirmation (see §16). Until then, the integration is specified as a provider-agnostic interface.

**Interface (`main/ai/provider.js`):**

```js
/**
 * @typedef {Object} AIProvider
 * @property {string} id
 * @property {(req: {
 *   input: string,
 *   context: { now: string, timezone: string, locale: string, actionIds: string[] },
 *   signal: AbortSignal
 * }) => Promise<{ intents: Intent[] }>} classify
 * @property {() => Promise<boolean>} healthCheck
 */
```

Requirements for any provider implementation:
- Supports structured/JSON output (or reliable JSON via prompt + validation).
- Timeout: 2.5 s soft limit for suggestions; on timeout, silently keep local results.
- Cancellation via `AbortController` on every new keystroke.
- Base URL, model name, and API key configurable in Settings.
- Rate limiting: max ~3 requests/second; debounce prevents bursts.
- Error handling: 401 → prompt to re-enter key; 429 → backoff; network error → offline mode indicator.
- API key stored via `safeStorage`; never exposed to the renderer.

### 8.2 Google Calendar

- **OAuth flow:** Desktop-app flow using the system browser + **loopback redirect** (`http://127.0.0.1:<random-port>`) with **PKCE**. The user supplies their own Google Cloud OAuth client ID (Desktop type) in Settings (personal-use friendly; avoids app verification).
- **Scopes:** `calendar.events` (create/read events) and optionally `calendar.readonly` (list calendars).
- **Token storage:** refresh + access tokens encrypted with `safeStorage`.
- **Operations:** `calendarList.list`, `events.insert`, `events.delete` (undo), `events.list` (conflict check / agenda).
- **Failure handling:** token refresh errors → "Reconnect Google" card; offline → disable action with explanation; quota errors → surface message.

### 8.3 macOS System Integrations

| Capability | API | Permission |
|---|---|---|
| Global shortcut | `globalShortcut` | None |
| Menu bar | `Tray` (template image) | None |
| Notifications | `Notification` | Notifications (prompted once) |
| Screenshot / recording | `desktopCapturer`, `screencapture` | Screen Recording |
| Microphone (optional) | `getUserMedia` | Microphone |
| File search | `mdfind` (Spotlight) | None (respects Spotlight privacy) |
| Open file / URL | `shell.openPath`, `shell.openExternal` | None |
| Reveal in Finder | `shell.showItemInFolder` | None |

A **Permissions** panel in Settings shows status per permission (via `systemPreferences.getMediaAccessStatus`) with deep links to System Settings panes.

---

## 9. Background Behavior & Scheduling

- **Single instance lock:** `app.requestSingleInstanceLock()`; second launch focuses/toggles the launcher.
- **Login item:** optional "Launch at login" (`app.setLoginItemSettings`).
- **Scheduler (main process):**
  - Stores **absolute due times**; uses a 1-second tick (or `setTimeout` to next due) rather than relying on elapsed counters, so sleep/wake doesn't drift.
  - On `powerMonitor` `resume` event: recompute all timers/reminders; fire anything overdue.
  - On app start: load `running` timers and `pending` reminders from SQLite, reschedule.
- **Notifications:** include actions where supported (Snooze, Done, Stop). Clicking a notification opens the launcher with the relevant widget.
- **Window lifecycle:** the launcher window is created once and shown/hidden (not destroyed) for fast summon. Content is reset on hide unless an active widget is "pinned" (e.g. a running stopwatch stays visible when reopened).

---

## 10. Settings

Opened with `⌘ ,` or from the tray. Rendered as a view in the same window (or a separate small window).

| Section | Options |
|---|---|
| **General** | Global shortcut (recorder), launch at login, hide on blur, show on active display, theme (system/light/dark) |
| **Suggestions** | Enable smart suggestions, AI provider config (base URL, model, API key, "Test connection"), max results, show recent on empty |
| **Actions** | Enable/disable each action, pin favorites, default timer sound, default event duration |
| **Calendar** | Connect/disconnect Google, default calendar, default event length, add Meet link by default |
| **Capture** | Screenshot folder, recording folder, format, copy-to-clipboard, include mic audio, stop-recording shortcut |
| **Search** | Default search engine, custom URL template |
| **Privacy** | Keep action history on/off, clear history, clear notes/reminders |
| **Permissions** | Live status + "Open System Settings" buttons |
| **About** | Version, data folder link, open logs |

Settings are persisted in the `settings` SQLite table; changes apply immediately (no restart), except the global shortcut which re-registers on change (with conflict detection and error message if registration fails).

---

## 11. Security & Privacy

- **Electron hardening:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`, no `remote` module, deny all new windows and navigation (`setWindowOpenHandler`, `will-navigate`), strict **Content-Security-Policy** (`default-src 'self'`; no inline scripts).
- **IPC:** every channel whitelisted in preload; main validates payloads (type/shape/length) before acting. No generic "run shell command" channel.
- **Command execution:** only fixed, parameterized invocations (`screencapture`, `mdfind`) using `execFile` with argument arrays — never string-built shell commands. Queries passed to `mdfind` are escaped/sanitized.
- **Math safety:** mathjs with disabled dangerous functions (`import`, `createUnit`, `evaluate`, `parse`, `simplify` from within expressions).
- **Secrets:** `safeStorage` encryption; never logged; never sent to the renderer.
- **Network:** renderer has no direct network access (CSP `connect-src 'none'`); all outbound calls originate from the main process to an explicit allow-list (AI base URL, Google APIs).
- **Data locality:** notes, reminders, history, and captures stay on the machine. Nothing is uploaded except AI query text and Google Calendar API calls.
- **Logging:** local log file (rotating, ~1 MB × 3) with no query text or secrets at default log level.

---

## 12. Performance Targets

| Metric | Target |
|---|---|
| Shortcut → window visible & focused | < 150 ms (window pre-created, hidden) |
| Keystroke → local suggestions rendered | < 50 ms |
| AI suggestions (when available) | p50 < 1.2 s, hard timeout 2.5 s |
| Idle memory (renderer + main) | < 200 MB |
| Idle CPU | ~0% (no polling when hidden other than scheduler timeout) |
| Cold start to tray-ready | < 2 s |

Optimizations: pre-warmed hidden window, lazy-load widgets with `React.lazy`, memoized suggestion rows, no heavy deps in the renderer's initial bundle.

---

## 13. Roadmap & Milestones

**M0 — Skeleton (day 1–2)**
Electron + Vite + React scaffold, tray icon, global shortcut toggling a frameless transparent window, hide-on-blur, dock hidden, single-instance lock.

**M1 — Launcher core (days 3–5)**
Input, suggestion list, keyboard navigation, action registry, Fuse.js matching, widget host, Zustand store, settings storage in SQLite.

**M2 — Simple actions (days 6–9)**
Calculator, unit conversion, web search, file/app launcher, timer + stopwatch (with scheduler, notifications, persistence, tray display).

**M3 — Notes & reminders (days 10–12)**
Notes with FTS search, reminders with notifications/snooze, missed-reminder handling.

**M4 — Capture (days 13–16)**
Screenshot (full/area/window), screen recording (+ stop shortcut, tray indicator), permissions panel.

**M5 — AI suggestions (days 17–20)**
Provider interface + chosen provider, intent schema validation, debounced/cancellable requests, ranking/merge, settings & key storage, offline fallback.

**M6 — Google Calendar (days 21–24)**
OAuth (PKCE + loopback), calendar form widget, insert/undo, conflict check, reconnect flow.

**M7 — Polish & packaging (days 25–28)**
Animations, empty/error states, accessibility pass, icons, unsigned `.app` build, launch-at-login, README.

**v1.1 backlog:** currency conversion, Pomodoro, clipboard history, snippets, agenda view, ffmpeg remux for recordings.

---

## 14. Testing Strategy

- **Unit (Vitest):** duration/time parsers, intent validation, ranking function, unit conversion, math sandbox, scheduler logic (with fake timers), DB migrations and queries (in-memory SQLite).
- **Integration:** IPC handlers with mocked executors; AI provider with recorded fixtures (valid JSON, malformed JSON, timeouts, 401/429).
- **E2E (Playwright + Electron, optional):** summon window, type a query, select a suggestion, verify widget renders.
- **Manual checklist (macOS):** permissions prompts (fresh user), sleep/wake timer accuracy, multi-display placement, full-screen app overlay, shortcut conflicts, dark/light mode, Reduce Motion.

---

## 15. Acceptance Criteria (v1)

1. Pressing the global shortcut shows the launcher with input focused; pressing it again (or `Esc`) hides it.
2. Typing `25m` shows a "Start 25-minute timer" suggestion within 50 ms; pressing `Enter` starts it, and it continues running after the window hides and fires a notification at 0.
3. Typing `remind me to call mom tomorrow at 5pm` yields a Reminder suggestion with the correct parsed date/time; a notification fires at that time (also after an app restart).
4. Typing `dentist friday 3pm 1 hour` yields a Calendar Event suggestion with a pre-filled form; confirming creates the event in Google Calendar, and **Undo** removes it.
5. `12*(3+4)` and `5 miles in km` show live results and copy on `Enter`.
6. "screenshot" offers full/area/window; the file lands in the configured folder, and a notification offers "Reveal in Finder".
7. "record screen" starts a recording with a visible tray indicator and a working stop shortcut; the file is playable.
8. Typing a file name fragment lists matching files; `Enter` opens, `⌘Enter` reveals.
9. With the network disabled, local actions still work and the UI indicates smart suggestions are offline.
10. All secrets are stored via `safeStorage`; none appear in logs or the SQLite DB.

---

## 16. Assumptions & Open Questions

### Assumptions made in this draft
- App name is **Cast**; it is macOS-only and for personal use (unsigned build is fine; you may need to right-click → Open the first time, or ad-hoc sign locally).
- Default global shortcut is `⌥ Space` because `⌘ Space` conflicts with Spotlight (can be changed if Spotlight's shortcut is disabled).
- You will create your own Google Cloud OAuth client (Desktop type) for Calendar access.
- Screen recording output format is `.webm` initially, with optional mp4 conversion later.
- Apple Silicon and Intel builds are both desired (universal build) — easy to restrict to arm64 only.
- Reminders are handled inside Cast (SQLite + notifications), **not** synced with Apple Reminders.

### Open questions (please confirm)
1. **AI provider:** What exactly are "Openjev" and the "codiv API"? Please share the correct name, base URL/docs link, auth method (API key? OAuth?), and whether it supports JSON/structured output and streaming. The spec currently treats it as a pluggable provider.
2. **Global shortcut preference:** Is `⌥ Space` OK, or do you want something else (e.g. `⌃ Space`, `⌘ ⇧ Space`)?
3. **Hide-on-blur:** Should the launcher always close when it loses focus, even if a timer/stopwatch widget is showing?
4. **Screen recording audio:** Do you need microphone and/or system audio? (System audio capture on macOS needs extra tooling such as a virtual audio device or newer ScreenCaptureKit support.)
5. **Reminders vs. Calendar:** Should reminders optionally create Google Calendar events too, or stay local only?
6. **History/privacy:** Is it OK to keep a local action history for "recent" suggestions, or should that be off by default?
7. **Visual style:** Any preference (Raycast-like dark glass, Spotlight-like light, minimal flat)? Any reference screenshots?
8. **Quick AI answers:** Should Cast eventually answer general questions ("what's the capital of France") in a result card, or stay strictly an action launcher?

---

## Appendix A — IPC Channel Reference (initial)

| Channel | Direction | Payload | Purpose |
|---|---|---|---|
| `launcher:hide` | R→M | — | Hide the window |
| `launcher:resize` | R→M | `{height}` | Adjust window height to content |
| `suggest:ai` | R→M (invoke) | `{input, requestId}` | Request AI intents |
| `suggest:cancel` | R→M | `{requestId}` | Abort in-flight AI request |
| `action:run` | R→M (invoke) | `{actionId, params}` | Execute an action |
| `timer:list` / `timer:update` | both | timer objects | Sync timer state to widget |
| `notes:*` | R→M (invoke) | CRUD / search | Notes operations |
| `reminders:*` | R→M (invoke) | CRUD | Reminder operations |
| `calendar:status` / `calendar:connect` / `calendar:create` / `calendar:undo` | R→M (invoke) | varies | Google Calendar |
| `capture:start` / `capture:stop` | R→M | `{kind, options}` | Screenshot/recording |
| `settings:get` / `settings:set` | R→M (invoke) | `{key, value}` | Settings |
| `permissions:status` / `permissions:open` | R→M (invoke) | `{type}` | macOS permissions |
| `window:shown` / `window:hidden` | M→R | — | Reset/refresh UI state |

All handlers validate payloads and return `{ok: true, data}` or `{ok: false, error: {code, message}}`.

## Appendix B — Example AI System Prompt (draft)

```
You are the intent classifier for Cast, a macOS launcher. Given the user's
partial input, return up to 4 likely actions as JSON ONLY, matching this schema:
{"intents":[{"actionId":string,"confidence":number(0-1),"params":object,"title":string,"subtitle"?:string}]}

Rules:
- Use only these actionIds: {{ACTION_IDS}}.
- Current time: {{NOW_ISO}}. Timezone: {{TZ}}. Locale: {{LOCALE}}.
- Resolve relative dates/times to ISO 8601 with offset.
- If the input is ambiguous, return multiple lower-confidence intents.
- If nothing fits, return {"intents":[]}.
- Never include explanations or markdown.
```

## Appendix C — Duration & Time Parsing Examples

| Input | Parsed |
|---|---|
| `25m` | timer, 1500 s |
| `timer 1h 30m` | timer, 5400 s |
| `in 2 hours` | reminder/timer prompt, +2h |
| `remind me tomorrow 9am to pay rent` | reminder at tomorrow 09:00, text "pay rent" |
| `lunch with sam thu 1pm` | calendar event, next Thursday 13:00, 30 min default |
| `standup every weekday 10am` | (v1.1) recurring event |

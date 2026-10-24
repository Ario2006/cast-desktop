# Cast

**A fast, keyboard-first launcher for macOS.** Press **⌥ Space**, type what you want in plain English,
press **Enter**. Cast starts timers, sets reminders, books calendar events, takes screenshots, does maths and
unit/currency conversions, opens files and apps, manages tasks and notes, and much more, then shows a small
interactive widget in the same window when an action needs one.

- **Instant:** local parsers answer on the same keystroke; an optional AI classifier (Openjev) picks the best
  tool for free-form requests.
- **Private:** everything stays on your Mac except the text you type to the AI provider, Google Calendar calls,
  and a few lookups (weather, exchange rates, definitions, translation) when you use them.
- **Quiet:** a menu-bar app with no Dock icon and a single small window.

> Status: personal-use build for Apple Silicon and Intel Macs. Not code-signed or notarized (see
> [Troubleshooting](#troubleshooting)).

---

## Contents

1. [Install](#install) · 2. [First launch](#first-launch) · 3. [Using Cast](#using-cast) ·
2. [What you can type](#what-you-can-type) · 5. [Setup guides](#setup-guides) · 6. [Settings reference](#settings-reference) ·
3. [Privacy & data](#privacy--data) · 8. [Troubleshooting](#troubleshooting) · 9. [Development](#development) ·
4. [Architecture](#architecture)

---

## Install

### Option A: the DMG (easiest)

1. Open `Cast-<version>-arm64.dmg` (Apple Silicon) and drag **Cast** onto **Applications**.
2. **Quit any older copy of Cast first** (click its **C** icon in the menu bar → **Quit Cast**). Cast allows only
   one running copy, so launching a new build while an old one runs silently does nothing.
3. Launch Cast from Applications. Because the build is not notarized, macOS blocks a normal double-click the first
   time: **right-click → Open → Open**. If macOS still says the app is "damaged", run:
   ```bash
   xattr -dr com.apple.quarantine /Applications/Cast.app
   ```

### Option B: run from source

Requires **macOS** and **Node.js 20.19+** (22+ recommended).

```bash
git clone <this repo> && cd cast-desktop
npm install
npm run dev        # starts Cast with hot reload; the C icon appears in the menu bar
```

Build your own app/DMG:

```bash
npm run pack       # unsigned Cast.app  → dist/mac-<arch>/Cast.app
npm run dist       # + .dmg for arm64 and x64 → dist/
```

> The path of the project may contain spaces: Cast ships native SQLite prebuilds, so nothing is compiled at
> install time.

---

## First launch

Cast lives in the **menu bar** (a **C** icon). A **Welcome** screen opens on first run with four optional steps:

| Step                  | What it does                                                                   |
| --------------------- | ------------------------------------------------------------------------------ |
| **Shortcut**          | Shows the global shortcut (**⌥ Space**). You can change it.                    |
| **Screen Recording**  | Opens the macOS permission needed for screenshots and recordings.              |
| **Smart suggestions** | Takes you to Settings to paste your AI key.                                    |
| **Google Calendar**   | Connects your calendar (one click when the build includes Google credentials). |

Click **Get started** when done. Bring the walkthrough back any time from the menu-bar icon (**Welcome tour…**)
or **Settings → About → Show**.

**Allow notifications** when macOS asks. Timers, Pomodoro and reminders use them (plus an alert sound).

---

## Using Cast

1. Press **⌥ Space** (works from any app, including over full-screen apps).
2. Start typing. Suggestions appear instantly; AI suggestions (if enabled) merge in about a second later.
3. Pick with **↑ ↓** and press **Enter**. Instant actions run and the window hides. Widget actions (timer,
   note, reminder…) open **inside the same window**.
4. **Esc** goes back one level: widget → results → clear text → hide.

### Keyboard

| Key          | Action                                                   |
| ------------ | -------------------------------------------------------- |
| **⌥ Space**  | Show / hide Cast (changeable)                            |
| **↑ / ↓**    | Move selection                                           |
| **Enter**    | Run the selected suggestion                              |
| **⌘ Enter**  | On a file: reveal in Finder instead of opening           |
| **⌘ 1 … 7**  | Run the Nth suggestion directly                          |
| **Tab**      | Autocomplete the highlighted suggestion into the input   |
| **⌘ C**      | Copy the highlighted result (calculator, conversions…)   |
| **⌘ ,**      | Open / close Settings                                    |
| **Esc**      | Back / clear / hide                                      |
| **?**        | Cheat sheet of everything you can type                   |
| **⌥⇧ Space** | Stop screen recording (only while recording; changeable) |

The window also hides when you click outside it or switch to another app (turn this off in
**Settings → General**). Drag it by the footer strip or the thin edge above the card.

### The empty state

With nothing typed, Cast shows what is **running** (timers, stopwatch, recording), your **favorites** (star actions in
Settings → Actions), your **recent** actions, and a one-line **daily briefing** (date, weather, next event, tasks due).

### Edit in plain English

Open widgets understand follow-ups in their quick-edit field:

- **Timer:** `make it 30 min`, `add 5 min`, or any text to rename it.
- **Calendar draft:** `move to 4pm`, `tomorrow 2pm`, `for 90 minutes`.
- **Reminder:** `tomorrow 9am`, `in 2 hours`, `make it daily` (plus a **Snooze** menu).

### It learns your habits

If you always pick the same action for a kind of input (e.g. "remind me …" → Reminder), it ranks higher next time.
Only a coarse pattern is stored (the first two words with numbers masked), never what you typed. Turn it off or clear it
in **Settings → Suggestions / Privacy**.

### Menu-bar icon

Left-click toggles Cast. Right-click opens a menu: **Open Cast**, running timers (with live time), **Stop recording**
(when recording), **Settings…**, **Welcome tour…**, **Check permissions**, **Quit Cast**. The menu-bar title can show
the nearest timer, your next meeting, the weather, or nothing (**Settings → General**).

---

## What you can type

Type `?` in Cast for this list. Every example is real.

### Time

| Type                                    | Result                                                               |
| --------------------------------------- | -------------------------------------------------------------------- |
| `25m`, `timer 1h 30m tea`, `in 2 hours` | Countdown timer (background, survives restarts)                      |
| `stopwatch`                             | Stopwatch with laps                                                  |
| `pomodoro`                              | Focus / break cycles (default 25 / 5 min, long break after 4 rounds) |
| `remind me to call mom tomorrow at 5pm` | Reminder with notification, snooze and repeat                        |
| `time in tokyo`, `3pm pst in ist`       | World clock and time-zone conversion                                 |

### Calendar and tasks

| Type                               | Result                                                             |
| ---------------------------------- | ------------------------------------------------------------------ |
| `dentist friday 3pm 1 hour`        | Pre-filled Google Calendar event (conflict warning, Undo for 10 s) |
| `standup every weekday 10am`       | Recurring event                                                    |
| `agenda`, `tomorrow's schedule`    | Your day's events                                                  |
| `join`                             | Opens your next Meet/Zoom/Teams link                               |
| `todo pay rent by friday`, `tasks` | Add / manage a to-do list                                          |
| `track client work`, `timesheet`   | Time tracking and weekly totals                                    |
| `briefing`                         | Daily briefing card                                                |

### Answers

| Type                                        | Result                                    |
| ------------------------------------------- | ----------------------------------------- |
| `12*(3+4)`, `15% of 240`, `sqrt(81)`        | Calculator (Enter copies)                 |
| `5 miles in km`, `72f in c`                 | Unit conversion                           |
| `100 usd to eur`, `$50 in inr`              | Live currency conversion (cached offline) |
| `weather`, `paris weather tomorrow`         | Weather                                   |
| `define serendipity`, `who is ada lovelace` | Dictionary and quick answers              |
| `translate good morning to spanish`         | Translation                               |

### Capture and text

| Type                              | Result                                               |
| --------------------------------- | ---------------------------------------------------- |
| `note buy milk`, `notes passport` | Quick notes with autosave and full-text search       |
| `obsidian: idea`                  | Send a note to Obsidian / Notion / Apple Notes       |
| `;sig`, `;`                       | Snippets (Enter copies; ⌘N new, ⌘E edit, ⌘⌫ delete)  |
| `clipboard`                       | Clipboard history (opt-in, see below)                |
| `:smile`, `emoji heart`           | Emoji picker                                         |
| `screenshot`, `record screen`     | Full / area / window capture; screen recording (mp4) |
| `color picker`                    | Eyedropper, copies HEX                               |

### Developers

| Type                                                 | Result                                     |
| ---------------------------------------------------- | ------------------------------------------ |
| `base64 hello`, `slugify …`, `json format`           | Text transforms (or on the clipboard)      |
| `uuid`, `password 24`, `lorem 3`                     | Generators                                 |
| `0xff`, `16px in rem`, `#ff8800`                     | Base / unit / colour conversions           |
| `cron 0 9 * * 1-5`                                   | Explain a cron expression                  |
| `json`, `regex`, `diff`                              | Scratchpad                                 |
| `npm react query`, `mdn fetch`, `py pathlib`, `gh …` | Docs search shortcuts                      |
| `proj cast`                                          | Open a project in your editor / terminal   |
| `ports`, `kill 3000`                                 | Listening ports; stop a dev server         |
| `script …`                                           | Your own scripts (see [Scripts](#scripts)) |

### Mac and system

| Type                                                                         | Result                                                                |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `left half`, `maximize`, `center window`                                     | Window layouts (needs Accessibility)                                  |
| `dark mode`, `lock`, `sleep`, `volume 40`, `mute`, `wifi off`, `empty trash` | System commands (destructive ones ask to confirm)                     |
| `call mom`, `facetime sam`, `email dad`                                      | Contacts                                                              |
| `shortcut morning`                                                           | Run a macOS Shortcut                                                  |
| `open figma`, `~/Documents`, a file name                                     | Apps and files (Spotlight index)                                      |
| `g cats`, `ddg …`, `yt lofi`, any URL                                        | Web search / open URL                                                 |
| `? invoice`                                                                  | Search everything: notes, snippets, clipboard, tasks, files, calendar |

### Chaining

Join requests with "and": `remind me to submit the report friday and block 2 hours tomorrow 9am` shows a card listing
each step; **Enter** runs them all.

---

## Setup guides

### Smart suggestions (Openjev)

Openjev is a **classifier**: as you type, Cast sends only the text to it, and it returns the best-fitting tool with
probabilities. Cast fills in the details (durations, dates, text) with its own local parsers, so the AI never
generates text. It also decides when a line is a question (offers web search) or noise (suggests nothing).

1. Open **Settings → Suggestions**.
2. Paste your API key into **API key** (stored encrypted in the macOS Keychain; never shown again).
3. Press **Test**. You should see "Connected".

Defaults: provider **Openjev**, base URL `https://api.codiv.ai`, model `jev-latest`. An **OpenAI-compatible**
provider (OpenAI, OpenRouter, Ollama, LM Studio…) is available in the same panel. Without a key or network,
all local suggestions keep working; the footer shows "Smart suggestions offline" if it can't connect.

### Google Calendar

**As a user:** **Settings → Calendar → Connect**, sign in with Google in your browser, done. The session is stored in
your Keychain. This is one click **when the build includes Google credentials** (below). If it doesn't, Settings → Calendar →
Advanced lets you paste your own OAuth client.

**As the developer / builder (one time):**

```bash
npm run setup:google   # walks you through Google Cloud Console and saves resources/google-oauth.json
npm run dist           # rebuild; the credentials are compiled into the app
```

In Google Cloud Console: create a project → enable the **Google Calendar API** → configure the OAuth consent screen
(scopes `calendar.events` and `calendar.readonly`) → create an **OAuth client ID of type Desktop app**. While the
consent screen is in _Testing_, add every Google account that should sign in as a **test user**. Releasing to the
public requires Google's app verification for the Calendar scopes. You can also pass the ID at build time with
`CAST_GOOGLE_CLIENT_ID` (and optional `CAST_GOOGLE_CLIENT_SECRET`).

### macOS permissions

| Permission                                    | Needed for                                     | Where it's requested                 |
| --------------------------------------------- | ---------------------------------------------- | ------------------------------------ |
| **Notifications**                             | Timer, Pomodoro and reminder alerts            | Prompt on the first alert            |
| **Screen Recording**                          | Screenshots and recordings                     | Welcome screen / first capture       |
| **Microphone**                                | Recording with audio (optional)                | When you enable it                   |
| **Accessibility**                             | Window layouts (`left half` …)                 | Prompt on first use                  |
| **Automation** (Contacts, Shortcuts, Finder…) | `call mom`, `shortcut …`, some system commands | Prompt on first use                  |
| **Paste from Other Apps** (recent macOS)      | Clipboard history                              | System Settings → Privacy & Security |

**Settings → Permissions** shows live status with buttons that open the right System Settings pane. After granting Screen
Recording you may need to quit and reopen Cast.

### Clipboard history

Off by default, because clipboards can hold sensitive text. Turn it on from the `clipboard` widget or **Settings →
Actions**. It keeps your last 50 text copies **in memory only** (nothing is written to disk; it clears when you quit)
and skips anything a password manager marks as secret. Items copied before you turn it on are not captured.

### Scripts

Run your own commands from Cast. Enable **Settings → Developer → Scripts**, then put executable files in the scripts
folder (default `~/Library/Application Support/Cast/Scripts`). Describe each with a header:

```bash
#!/bin/bash
# @cast.title Hello from Cast
# @cast.description Prints the date and your argument
# @cast.mode output          # output | silent | copy
# @cast.argument name
echo "Hello, ${1:-world}! It's $(date '+%A %H:%M')."
```

Only files directly inside that folder run, with arguments passed as an argument array (never through a shell string).

### Quicklinks, projects, integrations

- **Quicklinks** (**Settings → Quicklinks**): keyword → URL template. `jira ABC-12` opens a URL where `{query}` is replaced.
- **Projects** (**Settings → Developer**): choose project folders, editor (VS Code, Cursor, Zed, …) and terminal;
  `proj <name>` opens them.
- **Integrations** (**Settings → Integrations**): pick where `capture` notes go (Apple Notes, an Obsidian vault, or a Notion page).

---

## Settings reference

Open with **⌘ ,**. Changes apply immediately.

| Section          | What you can change                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **General**      | Shortcut, launch at login, hide on focus loss, which display, theme, text size, high contrast, menu-bar display, weather location and units |
| **Suggestions**  | Smart suggestions on/off, provider / URL / model / API key / **Test**, max results, recents, **learn from my choices**                      |
| **Actions**      | Enable/disable each action, star favorites, alert sound, Pomodoro lengths, task reminders, clipboard history, default event length          |
| **Calendar**     | Connect/disconnect Google, default calendar, Meet link default, advanced own-client fields                                                  |
| **Capture**      | Screenshot/recording folders and formats, copy to clipboard, open in Preview, microphone, stop-recording shortcut                           |
| **Search**       | Default search engine (Google, DuckDuckGo, Brave, Kagi, custom `{query}` URL)                                                               |
| **Developer**    | Projects, editor, terminal, scripts, rem base size                                                                                          |
| **Quicklinks**   | Your keyword → URL shortcuts                                                                                                                |
| **Integrations** | Obsidian / Notion / Apple Notes capture; macOS Focus shortcuts to run with Pomodoro                                                         |
| **Privacy**      | Action history on/off, clear learned data, clipboard, history, notes, reminders; export/import settings                                     |
| **Permissions**  | Live status and shortcuts to System Settings                                                                                                |
| **About**        | Version, data folder, logs, copy diagnostics, welcome tour                                                                                  |

---

## Privacy & data

- **Stays on your Mac:** notes, reminders, tasks, snippets, timers, history and captures (SQLite).
- **Sent out:** the text you type to your AI provider (if smart suggestions are on); Google Calendar API calls; and
  lookups only when you use them: weather (Open-Meteo), exchange rates (Frankfurter/ECB), definitions and answers
  (public dictionary / Wikipedia APIs), translations.
- **Secrets** (AI key, Google tokens) are encrypted with the macOS Keychain (`safeStorage`) in `secrets.bin`, are never
  shown in the UI again, never logged and never reach the web renderer.
- **Action history** stores only the _action you chose_ (never keystrokes) and can be turned off or cleared.
- **Where files live:** `~/Library/Application Support/Cast/` (`cast.db`, `secrets.bin`, `rates.json`, `logs/`). Open it from
  **Settings → About**. Delete that folder to reset Cast completely.

---

## Troubleshooting

| Problem                                    | Fix                                                                                                                                                                     |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Launching does nothing / no welcome screen | An old Cast may still be running (no Dock icon). Menu bar **C** → **Quit Cast**, or `pkill -x Cast`, then relaunch. Use **Welcome tour…** to see the walkthrough again. |
| "Cast is damaged" / can't be opened        | Unsigned build. Right-click → **Open**, or `xattr -dr com.apple.quarantine /Applications/Cast.app`.                                                                     |
| ⌥ Space doesn't open Cast                  | Another app owns the shortcut. Change it in **Settings → General**; Cast also notifies you if registration fails.                                                       |
| No timer / reminder notifications          | Allow Cast in **System Settings → Notifications** and check Focus modes. The alert sound plays regardless of banners.                                                   |
| Screenshots are blank or fail              | Grant **Screen Recording** (Settings → Permissions), then quit and reopen Cast.                                                                                         |
| Clipboard history is empty                 | It's off by default, only records copies made after enabling, and recent macOS may need **Paste from Other Apps** allowed.                                              |
| "Smart suggestions offline"                | No network, wrong key, or rate limit. Press **Test** in Settings → Suggestions.                                                                                         |
| Google says "access blocked"               | The consent screen is in Testing: add your account as a **test user** in Google Cloud Console.                                                                          |
| Something else                             | **Settings → About → View** logs, or **Copy diagnostics** to share.                                                                                                     |

---

## Development

```bash
npm install
npm run dev          # Electron + Vite with hot reload
npm run lint         # ESLint
npm run format       # Prettier
npm test             # unit tests (Vitest)
npm run test:e2e     # builds, then drives the real app with Playwright
npm run pack         # unsigned Cast.app
npm run dist         # DMGs
npm run setup:google # one-time Google OAuth client setup
```

### Project layout

```
src/main       Electron main: windows, tray, shortcuts, SQLite (db/), scheduler, AI (ai/), Google (google/),
               executors (actions/, tools/), IPC handlers (ipc/, one file per domain)
src/preload    contextBridge → window.cast (whitelisted channels only) + the recorder's preload
src/renderer   React UI: store/ (Zustand), hooks/, components/, widgets/ (lazy-loaded)
src/shared     Action registry and parsers (durations, chrono dates, maths, units, currency), ranking,
               intent validation, validators, settings schema, cheat sheet; used by both sides and the tests
scripts        make-icon.mjs (app icon), setup-google.mjs, afterPack.cjs (ad-hoc signing)
resources      icon.png, optional google-oauth.json
tests          unit tests and tests/e2e (Playwright)
```

### Adding an action

1. Describe it in `src/shared/actionRegistry.js` (or `actionsExtra.js`): `id`, `title`, `keywords`, `kind`
   (`instant` | `widget`), a `paramsSchema`, an optional `parse(input)` for local matching and `describe(params)` for the row.
   Give it an `aiHint` sentence if the AI classifier should be able to choose it.
2. Instant actions: add an executor in `src/main/actions/index.js`. Widgets: add a component in
   `src/renderer/widgets/` and register it in `WidgetHost.jsx`.
3. Add tests in `tests/`.

### Testing

- **Unit** (`npm test`): parsers, ranking, database and migrations, scheduler with fake timers, AI provider/service,
  OAuth/Calendar (including a real loopback flow), secrets, currency, services and more.
- **End-to-end** (`npm run test:e2e`): launches the built app with a throwaway data folder and uses it through the keyboard.
- **Smoke harness**: `CAST_SMOKE=1` runs a scripted session and writes screenshots plus a JSON report:
  ```bash
  npm run build
  CAST_SMOKE=1 CAST_USER_DATA=/tmp/cast-test CAST_SMOKE_OUT=/tmp/cast-out \
    CAST_SETTINGS='{"onboarded":true}' \
    CAST_SMOKE_STEPS='[{"type":"25m","rows":1,"shot":"timer"},{"key":"Enter","shot":"widget"}]' npx electron .
  ```

### Useful environment variables

| Variable                                              | Purpose                                                         |
| ----------------------------------------------------- | --------------------------------------------------------------- |
| `CAST_USER_DATA`                                      | Use a different data folder (testing)                           |
| `CAST_SETTINGS`                                       | JSON of settings to apply at startup, e.g. `{"onboarded":true}` |
| `CAST_GOOGLE_CLIENT_ID` / `CAST_GOOGLE_CLIENT_SECRET` | Google credentials to compile in at build time                  |
| `CAST_E2E`, `CAST_SMOKE*`                             | Test harness switches (window doesn't steal focus)              |

### Packaging notes

The app is ad-hoc signed under its real bundle ID (`dev.cast.launcher`) so macOS Notification Center recognises it, but it
is **not notarized**. Public distribution needs an Apple Developer ID certificate, notarization and an auto-updater.
The bundled `ffmpeg` (used to convert recordings to mp4) is unpacked from the asar.

---

## Architecture

- **Process model:** Electron main process owns everything that must outlive the window (timers, reminders, Pomodoro,
  recordings, clipboard poller, database). A sandboxed React renderer talks to it only through validated IPC
  (`window.cast`).
- **Suggestions:** tier 1, synchronous local parsers and fuzzy matching; tier 1.5, files, apps, notes and snippets;
  tier 2, Openjev classification (debounced, cancelled per keystroke, 2.5 s timeout, 429 backoff, answers cached).
  Rows are merged and ranked with `0.5·match + 0.3·AI + 0.1·recency + 0.1·frequency + 0.15·learned`.
- **Scheduler:** stores absolute due times in SQLite and re-arms on start and on wake from sleep, so timers and
  reminders never drift and survive restarts; missed reminders fire on next launch.
- **Security:** `contextIsolation`, `sandbox`, no Node in the renderer, strict CSP (`connect-src 'none'`), new windows
  and navigation denied, every IPC payload shape-checked and sender-checked, only fixed `execFile` argument arrays
  (never shell strings), mathjs sandboxed with `import`/`evaluate`/`parse` disabled.
- **UI:** a light, minimal design system (Inter, tokens in `src/renderer/styles/theme.css`); icons are inline SVG.

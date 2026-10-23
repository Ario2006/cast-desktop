# Cast

A Spotlight/Raycast-style launcher for macOS. Press **⌥ Space**, type, press **Enter**.

Cast turns what you type into actions — timers, reminders, calendar events, screenshots,
notes, calculations, unit conversions, file/app launching and web search — and runs
interactive widgets inside the same launcher window. Local parsers answer instantly;
an optional AI model understands free-form requests ("remind me to call mom tomorrow at 5").

Stack: Electron · React · Zustand · SQLite (better-sqlite3) · Fuse.js · chrono-node · mathjs · Vite (electron-vite).
Full specification: [`app-spec.md`](./app-spec.md).

## Quick start

```bash
npm install
npm run dev        # launch with hot reload (menu-bar icon appears; press ⌥ Space)
npm test           # unit tests (Vitest)
npm run test:e2e   # builds, then drives the real app with Playwright (24 tests)
npm run lint
npm run pack       # unsigned Cast.app in dist/mac-<arch>/
npm run dist       # + .dmg for arm64 and x64
```

Requires macOS and Node 20+. The first launch of an unsigned build needs right-click → Open.

> The better-sqlite3 version used ships N-API prebuilds, so no native compilation happens at
> install or package time (this also works from paths containing spaces).

## Using it

| Type                                           | Result                                                                                                    |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `25m`, `timer 1h 30m`, `timer for 5 min pasta` | Countdown timer (survives hiding the window and app restarts)                                             |
| `stopwatch`                                    | Stopwatch with laps                                                                                       |
| `remind me to call mom tomorrow at 5pm`        | Reminder with native notification (snooze / done), fires after a restart; missed ones fire on next launch |
| `dentist friday 3pm 1 hour`, `book meeting …`  | Google Calendar event form, pre-filled; conflict warning; Undo for 10 s                                   |
| `12*(3+4)`, `15% of 240`, `sqrt(81)`           | Live result — **Enter** or **⌘C** copies                                                                  |
| `5 miles in km`, `72f in c`, `2 cups to ml`    | Live conversion — Enter copies                                                                            |
| `screenshot`, `record screen`                  | Full / area / window capture; screen recording with menu-bar indicator                                    |
| `note buy milk`, `n: …`, `notes <query>`       | Quick notes with autosave and full-text search                                                            |
| `~/Documents`, a file or app name, `open …`    | Open (**↵**) or reveal in Finder (**⌘↵**)                                                                 |
| `pomodoro`                                     | Focus/break cycles (25/5, long break after 4) that run in the background and notify you at each switch    |
| `agenda`, `tomorrow's schedule`                | Your Google Calendar day; ←/→ switches Today/Tomorrow                                                     |
| `100 usd to eur`, `$50 in inr`                 | Live ECB exchange rates (cached, works offline with the last rates)                                       |
| `clipboard`                                    | Searchable history of what you copied (opt-in, memory-only)                                               |
| `;sig`, `snippets`                             | Saved text snippets: Enter copies, ⌘N new, ⌘E edit                                                        |
| `g cats`, `yt lofi`, `ddg …`, any URL          | Web search / open URL                                                                                     |

Keys: `↑↓` select · `↵` run · `⇥` complete · `⌘1…7` run Nth · `⎋` back / clear / hide · `⌘,` settings.

### More things to type (type `?` in Cast for the full, clickable list)

| Area         | Examples                                                                                                                                                                                                             |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Answers      | `weather`, `paris weather tomorrow`, `define serendipity`, `who is ada lovelace`, `translate good morning to spanish`                                                                                                |
| Time         | `time in tokyo`, `3pm pst in ist`, `standup every weekday 10am` (recurring events)                                                                                                                                   |
| Tasks & time | `todo pay rent friday 5pm` (also sets a reminder), `tasks`, `track client work`, `stop tracking`, `timesheet`, `briefing`                                                                                            |
| Calls        | `join` opens the next Meet / Zoom / Teams link from your calendar                                                                                                                                                    |
| Mac          | `lock`, `dark mode`, `volume 40`, `wifi off`, `empty trash` / `restart` (ask first), `left half`, `maximize`, `color picker`, `call mom`, `shortcut morning`                                                         |
| Developers   | `base64 hello`, `sha256 abc`, `slug`, `uuid`, `password 24`, `0xff`, `24px to rem`, `#ff8800`, `cron 0 9 * * 1-5`, `json` (JSON / regex / diff scratchpad), `npm react`, `gh prs`, `proj cast`, `ports`, `kill 3000` |
| Capture      | `obsidian: idea`, `apple note: …`, `notion: …`, `:rocket` (emoji), `? invoice` (search everything)                                                                                                                   |
| Combine      | `remind me to stretch at 9am and todo email sam` runs both                                                                                                                                                           |

You can also add your own **quicklinks** (Settings → Quicklinks, e.g. `jira ABC-12`) and **script commands**
(Settings → Developer). Your quicklinks, scripts and Shortcuts are offered to the AI classifier too, so
“open our issue tracker” can find them.

Some features need a one-time macOS permission: window layouts (Accessibility), and Notes / Contacts / dark mode /
Finder actions (Automation). Cast shows an explanatory card with a button to the right System Settings pane.

### Editing in plain English

Open widgets understand follow-ups: in a timer type “make it 30 min”, “add 5 min” or a label; in a calendar
draft “move to 4pm”, “tomorrow 2pm”, “for 90 minutes”; on a reminder “tomorrow 9am”, “make it daily”
(or use the Snooze menu).

### It learns your habits

If you always pick the same action for a kind of input (e.g. “remind me …” → Reminder), that action ranks
higher next time. Only a coarse pattern is stored (letters of the first two words, numbers masked), never the
text. Turn it off or clear it in Settings → Suggestions / Privacy.

## Configuration (⌘,)

- **Smart suggestions (AI)** — default provider is **Openjev** (TypeSafe AI "System One", `https://api.codiv.ai`,
  model `jev-latest`), a _classifier_: as you type, Cast asks it which tool best fits the text and uses the
  returned probabilities to rank up to four candidates. It never generates text; durations, times and
  note/reminder text are filled in locally by Cast's own parsers. Paste your key in Settings → Suggestions →
  API key (stored with Electron `safeStorage` / the macOS Keychain, never shown again, never sent to the
  renderer) and press **Test**. Only the text you type is sent. An OpenAI-compatible provider
  (OpenAI, OpenRouter, Ollama, LM Studio…) is available in the same panel. With no key or no network,
  local suggestions keep working.
- **Google Calendar** — create a _Desktop app_ OAuth client in Google Cloud Console (enable the Calendar API),
  paste the client ID (and secret, if shown) in Settings → Calendar, then **Connect**. Uses the system browser,
  loopback redirect and PKCE; tokens are encrypted with `safeStorage`.
- **Permissions** — Screen Recording (screenshots/recording), Microphone (optional), Notifications.
  Settings → Permissions shows live status with deep links.

Data lives in `~/Library/Application Support/Cast/` (`cast.db`, `secrets.bin`, `logs/`).
Set `CAST_USER_DATA=/some/dir` to use a throwaway data directory.

## Privacy

Everything is local except: the text you type to your AI provider, and (only when you use them) weather
(open-meteo.com), definitions (dictionaryapi.dev), Wikipedia, translation (mymemory.translated.net),
ECB exchange rates (frankfurter.dev), Google Calendar and Notion. Clipboard history is opt-in and memory-only.
Export (Settings → Privacy) never includes API keys or tokens and can be passphrase-encrypted.

## Architecture

```
src/main      Electron main: windows, tray, shortcuts, SQLite (db/), scheduler, AI (ai/), Google (google/),
              executors (actions/), IPC handlers (ipc/, one file per domain)
src/preload   contextBridge → window.cast (whitelisted channels only) + recorder preload
src/renderer  React UI: store/ (Zustand), hooks/, components/, widgets/ (lazy-loaded)
src/shared    Action registry, parsers (durations, chrono, mathjs, units), ranking, intent validation,
              validators, settings schema — pure JS, used by both sides and by the tests
tests/        Vitest suites (parsers, ranking, DB/FTS, scheduler with fake timers, AI service/provider,
              OAuth/Calendar incl. a real loopback flow, secrets, …)
```

- **Security**: `contextIsolation`, `sandbox`, no Node in the renderer, strict CSP (`connect-src 'none'`),
  windows/navigation denied, every IPC payload validated and sender-checked, only fixed `execFile` argv
  invocations (`screencapture`, `mdfind`), mathjs with `import/evaluate/parse/createUnit/simplify` disabled.
- **Scheduler** stores absolute due times in SQLite, re-arms from them on start and on sleep/wake, so timers and
  reminders never drift and survive restarts.
- **Suggestion engine**: tier 1 (sync, local parsers + Fuse) → tier 1.5 (files/apps/notes) → tier 2 (AI,
  debounced 300 ms, cancelled per keystroke, 2.5 s timeout, 429 backoff, schema-validated), merged and ranked with
  `0.5·match + 0.3·AI + 0.1·recency + 0.1·frequency`.

### Smoke-testing the real app

`CAST_SMOKE=1` runs a scripted session against the real launcher window and writes screenshots + a JSON report:

```bash
npm run build
CAST_SMOKE=1 CAST_USER_DATA=/tmp/cast-test CAST_SMOKE_OUT=/tmp/cast-out \
  CAST_SMOKE_STEPS='[{"type":"25m","rows":1,"shot":"timer"},{"key":"Enter","shot":"widget"}]' npx electron .
```

## Deviations from the spec / decisions to confirm

- **AI provider** — Openjev is a classifier, so the spec's JSON-intent prompt (Appendix B) is only used by the
  optional OpenAI-compatible provider. For Openjev, `src/main/ai/providers/openjev.js` sends one `choice`
  question (a label per tool, described by each action's `aiHint`) and `src/shared/inferParams.js` builds the
  parameters. The `AIProvider` interface (`src/main/ai/provider.js`) still lets you add another provider in one file.
- **Visual design** — a light-only, soft-minimal design system (pastel blue→ivory stage, floating white card,
  pill input, quiet result cards, Inter via `@fontsource-variable/inter`). All tokens live in
  `src/renderer/styles/theme.css`. The window is frameless and _transparent_; card, frame and shadow are CSS.
  The spec's proportions are scaled down to fit a 680 px launcher, and the dark/system theme option was removed
  because the design system rules dark themes out.
- **Google Calendar** uses the REST API via `fetch` instead of the `googleapis` package (smaller, same endpoints).
- **Action history** defaults to **on** (stores only the chosen action's title, never keystrokes) so "Recent"
  works out of the box; toggle in Settings → Privacy (§16 Q6).
- **Recording** is captured as `.webm` (MediaRecorder) and converted to `.mp4` with the bundled ffmpeg when you stop
  (the webm is kept if conversion fails; choose WebM in Settings → Capture to skip it).
- v1.1 items now included: currency conversion, Pomodoro, clipboard history, snippets, agenda, mp4 conversion
  (bundled ffmpeg), plus learning, natural-language edits, a welcome walkthrough and drag-to-move (footer / top edge).
  Still not implemented: the "Ask AI" no-match row, a built-in screenshot editor (use Settings → Capture →
  "Open in Preview" to crop/mark up) and auto-paste (needs the Accessibility permission).
- Screenshots, screen recording, native notification buttons and the global shortcut's foreground behaviour
  need real macOS permissions/UI, so they are covered by logic tests and a startup check but should be
  eyeballed on your machine (see the manual checklist in spec §14).

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
npm run lint
npm run pack       # unsigned Cast.app in dist/mac-<arch>/
npm run dist       # + .dmg for arm64 and x64
```

Requires macOS and Node 20+. The first launch of an unsigned build needs right-click → Open.

> The better-sqlite3 version used ships N-API prebuilds, so no native compilation happens at
> install or package time (this also works from paths containing spaces).

## Using it

| Type | Result |
|---|---|
| `25m`, `timer 1h 30m`, `timer for 5 min pasta` | Countdown timer (survives hiding the window and app restarts) |
| `stopwatch` | Stopwatch with laps |
| `remind me to call mom tomorrow at 5pm` | Reminder with native notification (snooze / done), fires after a restart; missed ones fire on next launch |
| `dentist friday 3pm 1 hour`, `book meeting …` | Google Calendar event form, pre-filled; conflict warning; Undo for 10 s |
| `12*(3+4)`, `15% of 240`, `sqrt(81)` | Live result — **Enter** or **⌘C** copies |
| `5 miles in km`, `72f in c`, `2 cups to ml` | Live conversion — Enter copies |
| `screenshot`, `record screen` | Full / area / window capture; screen recording with menu-bar indicator |
| `note buy milk`, `n: …`, `notes <query>` | Quick notes with autosave and full-text search |
| `~/Documents`, a file or app name, `open …` | Open (**↵**) or reveal in Finder (**⌘↵**) |
| `g cats`, `yt lofi`, `ddg …`, any URL | Web search / open URL |

Keys: `↑↓` select · `↵` run · `⇥` complete · `⌘1…7` run Nth · `⎋` back / clear / hide · `⌘,` settings.

## Configuration (⌘,)

- **Smart suggestions (AI)** — any OpenAI-compatible endpoint (OpenAI, OpenRouter, Ollama, LM Studio…):
  base URL, model, API key. The key is stored with Electron `safeStorage` (macOS Keychain) and is
  never sent to the renderer. Only the typed text plus current time/timezone/locale is sent.
  Local servers on `localhost` work without a key. With no key or no network, local suggestions keep working.
- **Google Calendar** — create a *Desktop app* OAuth client in Google Cloud Console (enable the Calendar API),
  paste the client ID (and secret, if shown) in Settings → Calendar, then **Connect**. Uses the system browser,
  loopback redirect and PKCE; tokens are encrypted with `safeStorage`.
- **Permissions** — Screen Recording (screenshots/recording), Microphone (optional), Notifications.
  Settings → Permissions shows live status with deep links.

Data lives in `~/Library/Application Support/Cast/` (`cast.db`, `secrets.bin`, `logs/`).
Set `CAST_USER_DATA=/some/dir` to use a throwaway data directory.

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

- **AI provider** — the spec's "Openjev / codiv API" is unspecified (§16 Q1). Cast ships a provider-agnostic
  OpenAI-compatible provider behind the `AIProvider` interface (`src/main/ai/provider.js`); another provider
  is one file.
- **Window style** — frameless, vibrancy `under-window`, but *not* `transparent: true`: a transparent window
  shows square vibrancy corners around the rounded container, whereas a non-transparent frameless window gets
  native rounded corners. Easy to change in `src/main/windows.js`.
- **Google Calendar** uses the REST API via `fetch` instead of the `googleapis` package (smaller, same endpoints).
- **Action history** defaults to **on** (stores only the chosen action's title, never keystrokes) so "Recent"
  works out of the box; toggle in Settings → Privacy (§16 Q6).
- **Recording** outputs `.webm` (MediaRecorder); mp4 remux is the v1.1 item from the spec.
- Not implemented (v1.1 backlog or optional in the spec): currency conversion, Pomodoro, clipboard history,
  the "Ask AI" no-match row, dragging the window by the input bar.
- Screenshots, screen recording, native notification buttons and the global shortcut's foreground behaviour
  need real macOS permissions/UI, so they are covered by logic tests and a startup check but should be
  eyeballed on your machine (see the manual checklist in spec §14).

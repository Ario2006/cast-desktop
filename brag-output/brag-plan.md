# Brag Plan: Cast

## What is this app?
Cast is a keyboard-first macOS launcher: press ⌥ Space, type what you want in plain English, press Enter. Timers, reminders, calendar events, maths and conversions all happen in one small window.

## The angle
"Say it, don't click it." Everything is shown as one launcher card that answers sentences. Local parsers reply on the same keystroke, and the AI only picks the tool, never writes your text. The video is a speedrun of typed sentences turning into finished actions, with no mouse and no menus.

## Hook (first 2-3 seconds)
Two giant keycaps, ⌥ and Space, press down together. The pastel launcher card pops in with a blinking cursor. Line: "Press ⌥ Space. Say what you want."

## Key moments (the middle)
- `15% of 240` is typed and the answer "36" is already on the row before the last keystroke settles. Then `5 miles in km` gives "8.05 km". Caption: "Answers land on the same keystroke."
- `remind me to call mom tomorrow at 5pm` is typed. A Reminder card appears with its time pre-filled. The quick-edit field takes "make it daily" and the card flips to "Daily".
- Chaining: `remind me to submit the report friday and block 2 hours tomorrow 9am` is typed. One card lists both steps (Reminder, Calendar event). Enter runs them together and both rows get green check marks.

## Outro / punchline
Small "C" menu-bar icon, then: "Cast. Quiet, private, one shortcut." Final held card: "⌥ Space".

## User flow worth showing
Entry: ⌥ Space opens the window. Key action: type a plain-English sentence. Result: an instant answer row or a pre-filled widget, then Enter runs it. Esc hides the window.

## Tone
- Preset: default
- Creative direction: keyboard speedrun. Calm and confident, no mouse in sight.
- Interpretation: clean and postable, with typing as the rhythm. Motion is snappy, and each typed line holds long enough to read.

## Format: landscape — 1920x1080
## Duration: 21s

## Visual identity (from the project, `src/renderer/styles/theme.css`)
- Background: pastel stage, `linear-gradient(115deg, #e7eeff 0%, #f7f8fc 52%, #fbf5ec 100%)` with a soft white radial highlight at the top
- Accent: `#4b7bff` (pale `#eaf0ff`, ring `rgba(75,123,255,0.16)`)
- Text: `#111827` headings, `#6b7280` body, `#9ca3af` placeholder
- Surface: `#ffffff` card, 14-24px radii, soft float shadow `0 14px 34px -12px rgba(17,24,39,0.18)`
- Success `#1b9a57` on `#e8f6ee`
- Display font: Inter Variable
- Body font: Inter Variable
- Strongest visual element: the white launcher card, with a pill search field, a "Dev"-style category chip, and rows with a soft blue selected state.

## Share copy (draft)
Cast is a keyboard-first launcher for macOS. Press ⌥ Space, type "remind me to call mom tomorrow at 5pm", press Enter. Done.

## Audio direction
- Role: warm bed with light, motion-matched accents
- Music: `happy-beats-business-moves-vol-1-by-ende-dot-app.mp3` (about 120 BPM, upbeat and clean)
- Music treatment: start at 0s, bed at about 0.35, fade out over the last 1.5s, nothing under the outro hold
- Music cue guidance: preset read (`assets/music/cues/...vol-1...music-cues.md`, 120.19 BPM, beat grid at 0.5s). The beat grid starts at 3.02s, so beat-lock scenes near that. Candidate strong cues for major moments: 17.02s (outro name slam), 18.02s, and 20.02s. In the middle, use the 0.5s grid for result pops. Sequential text uses every other beat or a hold.
- Audio-reactive treatment: subtle; use music RMS/bass to make the stage glow and card shadow breathe. No waveform or equalizer visuals.
- SFX posture: moderate; motion-matched. Keyboard presses for typing, a soft click for Enter, drop sounds for result rows, one bell on the outro.
- Audio-coupled moments: keycap press on the hook, per-character typing, Enter press, check marks landing, outro name.
- Restraint rule: typing sounds thin out so they never mask music or stack above about 0.5 volume.

## Storyboard

### Scene 1 — Hook — 3.5s
Two large keycaps, ⌥ and Space, press down together on the pastel stage and settle. They shrink to the top as the white launcher card scales in with a blinking cursor and the placeholder text. Line "Press ⌥ Space. Say what you want." holds about 1.5s.
Sequential/interaction: yes — a simulated keypress with both keys pressing in together.
Audio intent: confident, small, crisp.
Audio-coupled idea: a soft key thud on the press, a drop sound as the card lands.
Music: bed enters under the first press.
Transition mood: clean → Scene 2

### Scene 2 — Answers — 4.5s
Same card. `15% of 240` is typed and the row "36" appears with a "Calculator" hint. The field clears and `5 miles in km` is typed, giving "8.05 km". Caption "Answers land on the same keystroke." holds 1.5s settled.
Sequential/interaction: yes — typing, then a row pop-in after each line. Each result row holds at least 1.0s.
Audio intent: quick, tidy.
Audio-coupled idea: per-character keypresses at low volume, a drop sound as each result row lands.
Music: bed continues, beat grid active.
Transition mood: clean slide → Scene 3

### Scene 3 — Plain English — 6s
`remind me to call mom tomorrow at 5pm` is typed. A Reminder row appears, Enter presses, and the Reminder widget opens in the same card with "Call mom", "Tomorrow, 5:00 PM" and a quick-edit field. "make it daily" is typed there and the time chip flips to "Daily". Caption "Edit it in plain English." holds 1.2s.
Sequential/interaction: yes — typing, Enter, then a second typed edit. Widget text holds 1.2s.
Audio intent: satisfying, with a payoff on the chip flip.
Audio-coupled idea: keypresses, a click on Enter, a soft select sound on the chip flip.
Music: bed continues.
Transition mood: clean wipe → Scene 4

### Scene 4 — Chaining — 4s
`remind me to submit the report friday and block 2 hours tomorrow 9am` is typed (shortened with an ellipsis if it overflows). One card lists two steps: "Reminder — submit the report, Fri" and "Calendar — 2h block, tomorrow 9:00". Enter presses and both rows get green check marks one after the other. Caption "Say it once. Cast does both." holds 1.0s.
Sequential/interaction: yes — the two steps arrive one by one, then check marks land one by one. Each step row holds at least 1.0s.
Audio intent: a building run to the payoff.
Audio-coupled idea: card-place sounds on each step, a success accent on the second check.
Music: bed continues, building toward the 17.02s strong cue.
Transition mood: soft crossfade → Scene 5

### Scene 5 — Outro — 3s
The card slides away to leave the menu-bar "C" icon on a pastel stage. Text: "Cast". Tagline: "Quiet, private, one shortcut." Final ⌥ Space keycaps return small underneath and hold about 1s.
Sequential/interaction: none
Audio intent: clean landing, with a bell and a music fade.
Audio-coupled idea: a bell on the name landing, near the 18.02s strong cue.
Music: fades out over the last 1.5s.
Transition mood: end hold.

**Music mood for this video:** upbeat
**Audio summary:** A warm upbeat bed under typing and soft UI sounds, building to one clean bell on the name, then a fade.

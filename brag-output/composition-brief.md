# Hyperframes Composition Brief: Cast

## Output
- Composition: `brag-output/composition/` (generated HTML, GSAP timeline, Hyperframes 0.8.222)
- Render: `brag-output/brag.mp4`, landscape 1920x1080, 21s

## Source material
- Read: Readme.md, package.json, src/renderer/styles/theme.css, .smoke/json.png
- Product: Cast, a keyboard-first macOS launcher
- Strongest claim: "Press ⌥ Space, type what you want in plain English, press Enter."
- UI recreated: the pastel-framed white launcher card, pill search field, result rows, Reminder widget with quick-edit, chained-step card
- Verbatim examples used: `15% of 240`, `5 miles in km`, `remind me to call mom tomorrow at 5pm`, `make it daily`, `remind me to submit the report friday and block 2 hours tomorrow 9am`

## Creative direction
- Tone: default; keyboard speedrun
- Storyboard: see `brag-plan.md` (5 scenes: Hook, Answers, Plain English, Chaining, Outro)

## Visual identity
Taken from `theme.css`: stage gradient #e7eeff → #f7f8fc → #fbf5ec, accent #4b7bff, text #111827, Inter Variable (bundled woff2).

## Audio
- Music: happy-beats vol-1 at 0.35 with a 1.5s fade-out; cue preset used (120 BPM). Beat-locked: 17.02s (second check mark), 18.02s (Cast mark and bell).
- SFX: keypress set (typing), drop/select/click UI sounds, card-place for chained steps, one bell on the outro.
- Audio-reactive: skipped. The media-use extraction helper was not available in this environment.

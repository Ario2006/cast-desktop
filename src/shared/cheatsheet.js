/** Everything you can type, grouped — shown by "?" / "help". Every example is a real, working query. */
export const CHEATSHEET = [
  { group: 'Time', items: [
    ['25m', 'Start a timer'], ['timer 1h 30m tea', 'Timer with a label'], ['stopwatch', 'Stopwatch with laps'],
    ['pomodoro', 'Focus / break cycles'], ['remind me to call mom tomorrow at 5pm', 'Reminder'],
    ['time in tokyo', 'World clock'], ['3pm pst in ist', 'Convert time zones']
  ] },
  { group: 'Calendar & tasks', items: [
    ['dentist friday 3pm 1 hour', 'Calendar event'], ['standup every weekday 10am', 'Recurring event'],
    ['agenda', "Today's agenda"], ['join', 'Join your next video call'], ['todo pay rent by friday', 'Add a task'],
    ['tasks', 'Your to-do list'], ['track client work', 'Track time'], ['timesheet', 'Time this week'], ['briefing', 'Daily briefing']
  ] },
  { group: 'Answers', items: [
    ['weather', 'Weather here'], ['paris weather tomorrow', 'Forecast anywhere'], ['define serendipity', 'Dictionary'],
    ['who is ada lovelace', 'Quick answer'], ['translate good morning to spanish', 'Translate'],
    ['12*(3+4)', 'Calculator'], ['5 miles in km', 'Units'], ['100 usd to eur', 'Currency']
  ] },
  { group: 'Capture & text', items: [
    ['note buy milk', 'Quick note'], ['notes passport', 'Search notes'], ['obsidian: idea', 'Send to Obsidian / Notion / Apple Notes'],
    [';', 'Snippets'], ['clipboard', 'Clipboard history'], [':smile', 'Emoji'], ['screenshot', 'Screenshots'], ['record screen', 'Screen recording']
  ] },
  { group: 'Developers', items: [
    ['base64 hello', 'Text transforms (or on the clipboard)'], ['uuid', 'Generators: uuid, password 24, lorem 3'],
    ['0xff', 'Bases, px↔rem, colours'], ['cron 0 9 * * 1-5', 'Explain cron'], ['json', 'JSON · regex · diff scratchpad'],
    ['npm react query', 'Docs: npm, mdn, py, crates, so, gh'], ['proj cast', 'Open a project'], ['ports', 'Listening ports'],
    ['kill 3000', 'Stop a server']
  ] },
  { group: 'Mac', items: [
    ['left half', 'Window layouts'], ['dark mode', 'System: lock, sleep, volume 40, wifi off…'], ['color picker', 'Eyedropper'],
    ['call mom', 'Call, FaceTime, message, email'], ['shortcut morning', 'Run a Shortcut'], ['open figma', 'Apps & files'],
    ['g cats', 'Web search (ddg, yt, kagi…)'], ['? invoice', 'Search everything']
  ] }
] // prettier-ignore

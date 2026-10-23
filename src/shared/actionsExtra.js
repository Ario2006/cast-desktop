import * as s from './validate.js'
import {
  CAPTURE_TARGETS,
  LAYOUTS,
  SYSTEM_COMMANDS,
  expandQuicklink,
  languageName,
  parseAnswer,
  parseCapture,
  parseContact,
  parseDocs,
  parseMeeting,
  parsePorts,
  parseProject,
  parseShortcut,
  parseSystem,
  parseTask,
  parseTracking,
  parseTranslate,
  parseWeather,
  parseWindowLayout,
  DOC_SITES
} from './commands.js'
import {
  TRANSFORM_LABELS,
  devConvert,
  explainCron,
  parseGenerator,
  parseTransform
} from './devtools.js'
import { formatWhen } from './timeparse.js'
import { worldClock } from './worldclock.js'

/*
 * Actions added on top of the core registry. Extra fields:
 *   live     the row's title/result is resolved asynchronously in main (network, clipboard, crypto)
 *   onRun    'copy' | 'open' — what Enter does with a resolved row (instead of calling action:run)
 *   sync     (params, ctx) => { title, subtitle, copyText } computed instantly in the renderer
 */
const optStr = (max) => s.opt(s.str(max))
const one = (t = '', max = 60) => (t.length > max ? `${t.slice(0, max - 1)}…` : t)
const words = (input, re) => String(input).trim().replace(re, '').trim()

export const EXTRA_ACTIONS = [
  // --- everyday --------------------------------------------------------------------------------
  {
    id: 'weather.show',
    aiHint: 'Check the weather, temperature or forecast (rain, snow, how hot or cold it is).',
    title: 'Weather',
    keywords: ['weather', 'forecast', 'temperature', 'rain'],
    aliases: ['weather today'],
    icon: 'weather',
    kind: 'instant',
    live: true,
    onRun: 'copy',
    priority: 82,
    paramsSchema: s.obj({ place: optStr(80), day: s.opt(s.oneOf('today', 'tomorrow')) }),
    parse: (input) => {
      const w = parseWeather(input)
      return w ? { params: w, confidence: 0.97 } : null
    },
    describe: (p) => ({
      title: `Weather${p.place ? ` in ${p.place.replace(/\b\w/g, (c) => c.toUpperCase())}` : ''}${p.day === 'tomorrow' ? ' tomorrow' : ''}`,
      subtitle: 'Checking the forecast…'
    })
  },
  {
    id: 'answer.define',
    aiHint: 'Define a word or explain what a word means (dictionary).',
    title: 'Define',
    keywords: ['define', 'definition', 'meaning', 'dictionary'],
    aliases: [],
    icon: 'book',
    kind: 'instant',
    live: true,
    onRun: 'copy',
    priority: 83,
    paramsSchema: s.obj({ query: s.str(60, 1) }),
    parse: (input) => {
      const a = parseAnswer(input)
      return a?.kind === 'define' ? { params: { query: a.query }, confidence: 0.97 } : null
    },
    describe: (p) => ({ title: `Define “${one(p.query, 40)}”`, subtitle: 'Looking it up…' })
  },
  {
    id: 'answer.wiki',
    aiHint:
      'A factual question about a person, place, thing or concept (who is…, what is…, tell me about…).',
    title: 'Quick answer',
    keywords: ['wiki', 'wikipedia', 'who is', 'what is'],
    aliases: [],
    icon: 'book',
    kind: 'instant',
    live: true,
    onRun: 'open',
    priority: 81,
    paramsSchema: s.obj({ query: s.str(120, 1) }),
    parse: (input) => {
      const a = parseAnswer(input)
      return a?.kind === 'wiki' ? { params: { query: a.query }, confidence: 0.9 } : null
    },
    describe: (p) => ({ title: `About “${one(p.query, 40)}”`, subtitle: 'Asking Wikipedia…' })
  },
  {
    id: 'translate.text',
    aiHint: 'Translate text into another language.',
    title: 'Translate',
    keywords: ['translate', 'translation', 'how do you say'],
    aliases: [],
    icon: 'translate',
    kind: 'instant',
    live: true,
    onRun: 'copy',
    priority: 86,
    paramsSchema: s.obj({ text: s.str(500, 1), to: s.str(8, 2) }),
    parse: (input) => {
      const t = parseTranslate(input)
      return t ? { params: t, confidence: 0.97 } : null
    },
    describe: (p) => ({
      title: `Translate to ${languageName(p.to)}`,
      subtitle: `“${one(p.text, 50)}” · translating…`
    })
  },
  {
    id: 'clock.world',
    title: 'World clock',
    keywords: ['time in', 'world clock', 'time zone', 'timezone'],
    aliases: [],
    icon: 'globe',
    kind: 'instant',
    onRun: 'copy',
    priority: 92,
    copies: true,
    paramsSchema: s.obj({ input: s.str(120, 1) }),
    parse: (input, ctx) =>
      worldClock(input, ctx.now)
        ? { params: { input: String(input).trim() }, confidence: 0.99 }
        : null,
    sync: (p, ctx) => worldClock(p.input, ctx.now),
    describe: (p, ctx) => {
      const r = worldClock(p.input, ctx?.now ?? new Date())
      return r
        ? { title: r.title, subtitle: r.subtitle }
        : { title: 'World clock', subtitle: 'e.g. “time in tokyo”, “3pm pst in ist”' }
    }
  },
  {
    id: 'system.command',
    aiHint:
      'Control the Mac: lock, sleep, dark mode, volume, mute, Wi-Fi, empty trash, restart, shut down.',
    title: 'System command',
    keywords: [
      'lock',
      'sleep',
      'dark mode',
      'mute',
      'volume',
      'wifi',
      'empty trash',
      'restart',
      'shut down'
    ],
    aliases: ['system'],
    icon: 'power',
    kind: 'instant',
    priority: 90,
    paramsSchema: s.obj({
      command: s.oneOf(...Object.keys(SYSTEM_COMMANDS)),
      level: s.opt(s.int(0, 100)),
      confirmed: s.opt(s.bool)
    }),
    parse: (input) => {
      const c = parseSystem(input)
      return c ? { params: c, confidence: 0.96 } : null
    },
    describe: (p) => ({
      title:
        p.command === 'volume' ? `Set volume to ${p.level}%` : SYSTEM_COMMANDS[p.command].label,
      subtitle: SYSTEM_COMMANDS[p.command].confirm ? 'Asks to confirm first' : 'System'
    })
  },
  {
    id: 'emoji.pick',
    aiHint: 'Find an emoji or symbol to copy.',
    title: 'Emoji',
    keywords: ['emoji', 'emojis', 'emoticon', 'symbol'],
    aliases: ['emoji picker'],
    icon: 'smile',
    kind: 'widget',
    priority: 70,
    paramsSchema: s.obj({ query: optStr(60) }),
    parse: (input) => {
      const m = String(input).match(/^(?::|emoji\s+)([\w+ -]{1,40})$/i)
      return m ? { params: { query: m[1].trim() }, confidence: 0.95 } : null
    },
    describe: (p) => ({
      title: p.query ? `Emoji: “${p.query}”` : 'Emoji picker',
      subtitle: '↵ copies'
    })
  },
  {
    id: 'color.pick',
    aiHint: 'Pick a colour from anywhere on screen (eyedropper) and copy its hex code.',
    title: 'Pick color',
    keywords: ['color picker', 'colour picker', 'eyedropper', 'pick color', 'pick colour'],
    aliases: ['eyedropper'],
    icon: 'droplet',
    kind: 'instant',
    priority: 68,
    paramsSchema: s.obj({}),
    describe: () => ({ title: 'Pick a color from the screen', subtitle: 'Copies the HEX code' })
  },
  {
    id: 'contact.open',
    title: 'Contact',
    keywords: ['call', 'facetime', 'message', 'email'],
    aliases: [],
    icon: 'phone',
    kind: 'instant',
    priority: 72,
    paramsSchema: s.obj({
      via: s.oneOf('call', 'facetime', 'facetime-audio', 'message', 'email'),
      value: s.str(200, 1),
      name: optStr(120)
    }),
    detect: (input) => parseContact(input),
    describe: (p) => {
      const verb = {
        call: 'Call',
        facetime: 'FaceTime',
        'facetime-audio': 'FaceTime Audio',
        message: 'Message',
        email: 'Email'
      }[p.via]
      return { title: `${verb} ${p.name ?? p.value}`, subtitle: p.value }
    }
  },
  {
    id: 'shortcut.run',
    title: 'Run Shortcut',
    keywords: ['shortcut', 'shortcuts', 'run shortcut'],
    aliases: [],
    icon: 'bolt',
    kind: 'instant',
    priority: 71,
    paramsSchema: s.obj({ name: s.str(120, 1) }),
    detect: (input) => parseShortcut(input),
    describe: (p) => ({ title: `Run “${one(p.name, 44)}”`, subtitle: 'Shortcuts app' })
  },

  // --- developers ------------------------------------------------------------------------------
  {
    id: 'dev.transform',
    title: 'Transform text',
    keywords: [
      'base64',
      'urlencode',
      'slugify',
      'json format',
      'uppercase',
      'sha256',
      'md5',
      'camelcase'
    ],
    aliases: [],
    icon: 'code',
    kind: 'instant',
    live: true,
    onRun: 'copy',
    priority: 89,
    paramsSchema: s.obj({ op: s.oneOf(...Object.keys(TRANSFORM_LABELS)), text: optStr(20_000) }),
    parse: (input) => {
      const t = parseTransform(input)
      return t ? { params: t, confidence: 0.97 } : null
    },
    describe: (p) => ({
      title: `${TRANSFORM_LABELS[p.op]} ${p.text ? '' : 'clipboard'}`.trim(),
      subtitle: 'Working…'
    })
  },
  {
    id: 'dev.generate',
    aiHint:
      'Generate a UUID, a strong password, lorem ipsum text, a random number or the current timestamp.',
    title: 'Generate',
    keywords: ['uuid', 'password', 'lorem ipsum', 'random number', 'timestamp', 'epoch'],
    aliases: [],
    icon: 'sparkle',
    kind: 'instant',
    live: true,
    onRun: 'copy',
    priority: 89,
    paramsSchema: s.obj({
      kind: s.oneOf('uuid', 'password', 'lorem', 'now', 'epoch', 'random', 'coin'),
      length: s.opt(s.int(6, 128)),
      symbols: s.opt(s.bool),
      count: s.opt(s.int(1, 20)),
      unit: s.opt(s.oneOf('word', 'sentence', 'paragraph')),
      value: s.opt(s.num(-1e15, 1e15)),
      min: s.opt(s.int(-1e9, 1e9)),
      max: s.opt(s.int(-1e9, 1e9))
    }),
    parse: (input) => {
      const g = parseGenerator(input)
      return g ? { params: g, confidence: 0.98 } : null
    },
    describe: (p) => ({
      title: {
        uuid: 'New UUID',
        password: 'New password',
        lorem: 'Lorem ipsum',
        now: 'Current timestamp',
        epoch: 'Convert timestamp',
        random: 'Random number',
        coin: 'Flip a coin'
      }[p.kind],
      subtitle: 'Generating…'
    })
  },
  {
    id: 'dev.convert',
    title: 'Convert',
    keywords: ['hex', 'binary', 'rem', 'rgb', 'hsl'],
    aliases: [],
    icon: 'convert',
    kind: 'instant',
    onRun: 'copy',
    copies: true,
    priority: 94,
    paramsSchema: s.obj({ input: s.str(100, 1) }),
    parse: (input, ctx) =>
      devConvert(input, { remBase: ctx.settings.remBase })
        ? { params: { input: String(input).trim() }, confidence: 1 }
        : null,
    sync: (p, ctx) => devConvert(p.input, { remBase: ctx.settings.remBase }),
    describe: (p, ctx) => {
      const r = devConvert(p.input, { remBase: ctx?.settings?.remBase ?? 16 })
      return r ? { title: r.title, subtitle: r.subtitle } : { title: 'Convert', subtitle: '' }
    }
  },
  {
    id: 'dev.cron',
    title: 'Explain cron',
    keywords: ['cron', 'crontab'],
    aliases: [],
    icon: 'clock',
    kind: 'instant',
    onRun: 'copy',
    copies: true,
    priority: 88,
    paramsSchema: s.obj({ input: s.str(120, 1) }),
    parse: (input) =>
      explainCron(input) ? { params: { input: String(input).trim() }, confidence: 0.99 } : null,
    sync: (p) => {
      const r = explainCron(p.input)
      return (
        r && {
          title: r.title,
          subtitle: `cron ${r.expression}`,
          copyText: r.invalid ? undefined : r.title
        }
      )
    },
    describe: (p) => {
      const r = explainCron(p.input)
      return {
        title: r?.title ?? 'Explain cron',
        subtitle: r ? `cron ${r.expression}` : 'e.g. “cron 0 9 * * 1-5”'
      }
    }
  },
  {
    id: 'dev.scratchpad',
    aiHint:
      'Format or validate JSON, test a regular expression, or compare (diff) two pieces of text.',
    title: 'Dev scratchpad',
    description: 'JSON formatter, regex tester and text diff',
    keywords: ['json', 'regex', 'diff', 'compare text', 'scratchpad', 'format json'],
    aliases: ['regex tester', 'json formatter', 'text diff'],
    icon: 'code',
    kind: 'widget',
    priority: 66,
    paramsSchema: s.obj({ mode: s.opt(s.oneOf('json', 'regex', 'diff')) }),
    parse: (input) => {
      const m = String(input)
        .trim()
        .match(/^(json|regex|regexp|diff)$/i)
      return m
        ? { params: { mode: m[1].toLowerCase().replace('regexp', 'regex') }, confidence: 0.96 }
        : null
    },
    describe: (p) => ({
      title:
        { json: 'JSON formatter', regex: 'Regex tester', diff: 'Text diff' }[p.mode] ??
        'Dev scratchpad',
      subtitle: 'JSON · regex · diff'
    })
  },
  {
    id: 'docs.search',
    title: 'Search docs',
    keywords: ['npm', 'mdn', 'pypi', 'crates', 'stack overflow', 'github'],
    aliases: [],
    icon: 'search',
    kind: 'instant',
    onRun: 'open',
    priority: 87,
    paramsSchema: s.obj({
      site: s.oneOf(...Object.keys(DOC_SITES)),
      query: s.str(200, 1),
      url: s.str(500, 1)
    }),
    parse: (input) => {
      const d = parseDocs(input)
      return d ? { params: d, confidence: 0.96 } : null
    },
    describe: (p) => ({
      title: `Search ${DOC_SITES[p.site].name} for “${one(p.query, 40)}”`,
      subtitle: p.url.replace(/^https?:\/\//, '').slice(0, 70)
    })
  },
  {
    id: 'quicklink.open',
    title: 'Quicklink',
    keywords: ['quicklink'],
    aliases: [],
    icon: 'link',
    kind: 'instant',
    onRun: 'open',
    priority: 91,
    paramsSchema: s.obj({
      id: s.int(1),
      name: optStr(60),
      query: optStr(500),
      url: s.str(2000, 1)
    }),
    parse: (input, ctx) => {
      const [first, ...rest] = String(input).trim().split(/\s+/)
      const link = ctx.quicklinks?.find((q) => q.keyword.toLowerCase() === first?.toLowerCase())
      if (!link) return null
      const query = rest.join(' ')
      if (link.url.includes('{query}') && !query)
        return {
          params: { id: link.id, name: link.name, url: link.url.replace(/\{query\}/g, '') },
          confidence: 0.9
        }
      return {
        params: {
          id: link.id,
          name: link.name,
          query: query || undefined,
          url: expandQuicklink(link.url, query)
        },
        confidence: 0.98
      }
    },
    describe: (p) => ({
      title: p.query ? `${p.name}: ${one(p.query, 40)}` : `Open ${p.name ?? 'quicklink'}`,
      subtitle: p.url.replace(/^https?:\/\//, '').slice(0, 70)
    })
  },
  {
    id: 'project.open',
    title: 'Open project',
    keywords: ['project', 'repo', 'code'],
    aliases: [],
    icon: 'folder',
    kind: 'instant',
    priority: 73,
    paramsSchema: s.obj({
      path: s.str(1000, 1),
      name: optStr(120),
      target: s.opt(s.oneOf('editor', 'terminal'))
    }),
    detect: (input) => parseProject(input),
    describe: (p) => ({ title: `Open ${p.name ?? p.path.split('/').pop()}`, subtitle: p.path })
  },
  {
    id: 'ports.manage',
    aiHint: 'See which ports/local servers are running on this Mac, or stop the process on a port.',
    title: 'Ports',
    description: 'Listening ports and the processes behind them',
    keywords: ['ports', 'localhost', 'kill port', 'listening'],
    aliases: ['open ports'],
    icon: 'server',
    kind: 'widget',
    priority: 67,
    paramsSchema: s.obj({ port: s.opt(s.int(1, 65535)) }),
    parse: (input) => {
      const p = parsePorts(input)
      return p?.op === 'list' ? { params: { port: p.port }, confidence: 0.96 } : null
    },
    describe: (p) => ({
      title: p.port ? `What’s on port ${p.port}` : 'Listening ports',
      subtitle: 'Local servers and processes'
    })
  },
  {
    id: 'port.kill',
    title: 'Stop process on port',
    keywords: ['kill port'],
    aliases: [],
    icon: 'stop',
    kind: 'instant',
    priority: 92,
    paramsSchema: s.obj({ port: s.int(1, 65535), confirmed: s.opt(s.bool) }),
    parse: (input) => {
      const p = parsePorts(input)
      return p?.op === 'kill' ? { params: { port: p.port }, confidence: 0.97 } : null
    },
    describe: (p) => ({
      title: `Stop the process on port ${p.port}`,
      subtitle: 'Asks to confirm first'
    })
  },
  {
    id: 'script.run',
    title: 'Run script',
    keywords: ['script'],
    aliases: [],
    icon: 'terminal',
    kind: 'widget',
    priority: 72,
    paramsSchema: s.obj({
      id: s.str(200, 1),
      title: optStr(120),
      argument: optStr(1000),
      takesArgument: s.opt(s.bool)
    }),
    describe: (p) => ({
      title: p.title ?? p.id,
      subtitle: p.argument ? `with “${one(p.argument, 40)}”` : 'Script command'
    })
  },

  // --- productivity ----------------------------------------------------------------------------
  {
    id: 'task.add',
    aiHint: 'Add a to-do or task to the task list, optionally with a due date.',
    title: 'Add task',
    keywords: ['todo', 'task', 'add task', 'to-do'],
    aliases: ['new task'],
    icon: 'check',
    kind: 'instant',
    priority: 87,
    paramsSchema: s.obj({ text: s.str(500, 1), due: s.opt(s.isoDate) }),
    parse: (input, ctx) => {
      const t = parseTask(input, ctx.now)
      return t ? { params: { text: t.text, due: t.due }, confidence: 0.97 } : null
    },
    describe: (p, ctx) => ({
      title: `Add task: ${one(p.text, 44)}`,
      subtitle: p.due ? `Due ${formatWhen(p.due, ctx?.now ?? new Date())}` : 'No due date'
    })
  },
  {
    id: 'tasks.open',
    aiHint: 'Show the to-do list / tasks to check things off.',
    title: 'Tasks',
    description: 'Your to-do list',
    keywords: ['tasks', 'todos', 'to-do list', 'my tasks', 'checklist'],
    aliases: ['todo list'],
    icon: 'check',
    kind: 'widget',
    priority: 79,
    paramsSchema: s.obj({}),
    describe: () => ({ title: 'Tasks', subtitle: 'Your to-do list' })
  },
  {
    id: 'time.track',
    aiHint: 'Start tracking time spent on a project or activity.',
    title: 'Track time',
    keywords: ['track', 'time tracking', 'clock in', 'working on'],
    aliases: ['start tracking'],
    icon: 'stopwatch',
    kind: 'instant',
    priority: 85,
    paramsSchema: s.obj({ project: s.str(60, 1) }),
    parse: (input) => {
      const t = parseTracking(input)
      return t?.op === 'start' ? { params: { project: t.project }, confidence: 0.96 } : null
    },
    describe: (p) => ({
      title: `Track time on “${one(p.project, 40)}”`,
      subtitle: 'Stops anything else being tracked'
    })
  },
  {
    id: 'time.stop',
    title: 'Stop tracking',
    keywords: ['stop tracking'], // "clock out" handled by the parser (avoids matching "lock")
    aliases: [],
    icon: 'stop',
    kind: 'instant',
    priority: 86,
    paramsSchema: s.obj({}),
    parse: (input) =>
      parseTracking(input)?.op === 'stop' ? { params: {}, confidence: 0.97 } : null,
    describe: () => ({ title: 'Stop tracking time', subtitle: 'Time tracking' })
  },
  {
    id: 'time.report',
    aiHint: 'Show how much time was tracked per project this week (timesheet).',
    title: 'Timesheet',
    description: 'Time tracked per project',
    keywords: ['timesheet', 'time report', 'tracked time', 'hours'],
    aliases: [],
    icon: 'chart',
    kind: 'widget',
    priority: 74,
    paramsSchema: s.obj({}),
    parse: (input) =>
      parseTracking(input)?.op === 'report' ? { params: {}, confidence: 0.96 } : null,
    describe: () => ({ title: 'Timesheet', subtitle: 'Today and this week' })
  },
  {
    id: 'meeting.join',
    aiHint: 'Join the next video meeting or call (Google Meet, Zoom, Teams) from the calendar.',
    title: 'Join meeting',
    keywords: ['join', 'join meeting', 'next meeting', 'zoom', 'meet'],
    aliases: ['join call'],
    icon: 'video',
    kind: 'instant',
    live: true,
    onRun: 'open',
    priority: 88,
    paramsSchema: s.obj({}),
    parse: (input) => (parseMeeting(input) ? { params: {}, confidence: 0.98 } : null),
    describe: () => ({ title: 'Join next meeting', subtitle: 'Checking your calendar…' })
  },
  {
    id: 'window.layout',
    aiHint:
      'Move or resize the current window: left or right half, maximize, center, next display.',
    title: 'Window layout',
    keywords: ['left half', 'right half', 'maximize', 'center window', 'next display'],
    aliases: ['window'],
    icon: 'layout',
    kind: 'instant',
    priority: 84,
    paramsSchema: s.obj({ layout: s.oneOf(...Object.keys(LAYOUTS), 'nextdisplay') }),
    parse: (input) => {
      const l = parseWindowLayout(input)
      return l ? { params: l, confidence: 0.95 } : null
    },
    describe: (p) => ({
      title: `Window: ${LAYOUTS[p.layout]?.label ?? p.layout}`,
      subtitle: 'Arranges the frontmost window'
    })
  },
  {
    id: 'note.send',
    aiHint: 'Save a quick note to Apple Notes, Obsidian or Notion.',
    title: 'Quick capture',
    keywords: ['apple notes', 'obsidian', 'notion', 'capture'],
    aliases: [],
    icon: 'inbox',
    kind: 'instant',
    priority: 86,
    paramsSchema: s.obj({ target: s.oneOf(...Object.keys(CAPTURE_TARGETS)), text: s.str(5000, 1) }),
    parse: (input) => {
      const c = parseCapture(input)
      return c ? { params: c, confidence: 0.97 } : null
    },
    describe: (p) => ({ title: `Send to ${CAPTURE_TARGETS[p.target]}`, subtitle: one(p.text, 60) })
  },
  {
    id: 'chain.run',
    title: 'Do several things',
    keywords: ['and'],
    aliases: [],
    icon: 'list',
    kind: 'widget',
    priority: 99,
    paramsSchema: s.obj({
      steps: s.arr(
        s.obj({
          actionId: s.str(60, 1),
          params: s.any(6000),
          title: optStr(200),
          subtitle: optStr(200)
        }),
        4
      )
    }),
    describe: (p) => ({
      title: `Do ${p.steps.length} things`,
      subtitle: p.steps
        .map((x) => x.title)
        .join(' · ')
        .slice(0, 120)
    })
  },
  {
    id: 'search.all',
    aiHint:
      'Search across everything saved in Cast: notes, tasks, snippets, clipboard, files and quicklinks.',
    title: 'Search everything',
    keywords: ['search everything', 'find anything', 'search all'],
    aliases: [],
    icon: 'search',
    kind: 'widget',
    priority: 63,
    paramsSchema: s.obj({ query: optStr(200) }),
    parse: (input) => {
      const m = String(input).match(/^(?:\?\s+|search everything\s+|find anything\s+)(.+)$/i)
      return m ? { params: { query: m[1].trim() }, confidence: 0.97 } : null
    },
    describe: (p) => ({
      title: p.query ? `Search everything for “${one(p.query, 36)}”` : 'Search everything',
      subtitle: 'Notes, tasks, snippets, clipboard, files'
    })
  },
  {
    id: 'help.cheatsheet',
    aiHint: 'Show help: what Cast can do and what to type.',
    title: 'What can I type?',
    keywords: ['help', 'cheat sheet', 'commands', 'what can i do'],
    aliases: ['?'],
    icon: 'help',
    kind: 'widget',
    priority: 62,
    paramsSchema: s.obj({}),
    parse: (input) =>
      /^(?:\?|help|cheat ?sheet)$/i.test(String(input).trim())
        ? { params: {}, confidence: 0.99 }
        : null,
    describe: () => ({ title: 'What can I type?', subtitle: 'Every command, with examples' })
  },
  {
    id: 'insights.show',
    aiHint: 'Show my weekly usage summary / productivity insights.',
    title: 'Insights',
    description: 'Your week with Cast',
    keywords: ['insights', 'stats', 'my week', 'weekly summary'],
    aliases: [],
    icon: 'chart',
    kind: 'widget',
    priority: 61,
    paramsSchema: s.obj({}),
    describe: () => ({ title: 'Insights', subtitle: 'Your week, privately' })
  },
  {
    id: 'briefing.show',
    aiHint: 'Show the daily briefing: agenda, due tasks, timers and weather for today.',
    title: 'Daily briefing',
    keywords: ['briefing', 'good morning', 'daily briefing', 'overview'],
    aliases: ['morning briefing'],
    icon: 'sun',
    kind: 'widget',
    priority: 77,
    paramsSchema: s.obj({}),
    describe: () => ({ title: 'Daily briefing', subtitle: 'Agenda, tasks, timers and weather' })
  }
]

/** Params for an action chosen by the classifier from free text (null = can't run for this input). */
export function inferExtraParams(actionId, text, { now = new Date() } = {}) {
  switch (actionId) {
    case 'weather.show':
      return parseWeather(text) ?? {}
    case 'answer.define': {
      const a = parseAnswer(text)
      const q = a?.kind === 'define' ? a.query : words(text, /^(?:define|meaning of)\s+/i)
      return q && q.split(' ').length <= 3 ? { query: q } : null
    }
    case 'answer.wiki': {
      const a = parseAnswer(text)
      const q = a?.kind === 'wiki' ? a.query : words(text, /[?]$/)
      return q ? { query: q.slice(0, 120) } : null
    }
    case 'translate.text':
      return parseTranslate(text)
    case 'system.command': {
      const exact = parseSystem(text)
      if (exact) return exact
      // free phrasing from the classifier ("turn on dark mode", "mute the sound"); destructive
      // commands (restart, shut down…) are never inferred loosely
      const t = text.toLowerCase()
      const vol = t.match(/volume\D{0,12}(\d{1,3})/)
      if (vol) return { command: 'volume', level: Math.min(100, Number(vol[1])) }
      if (/\b(?:dark|light|night) ?mode|appearance/.test(t)) return { command: 'darkmode' }
      if (/\bunmute\b/.test(t)) return { command: 'unmute' }
      if (/\bmute\b/.test(t)) return { command: 'mute' }
      if (/\bscreen ?saver\b/.test(t)) return { command: 'screensaver' }
      if (/\bwi-?fi\b.*\boff\b|\boff\b.*\bwi-?fi\b|disable wi-?fi/.test(t))
        return { command: 'wifioff' }
      if (/\bwi-?fi\b.*\bon\b|\bon\b.*\bwi-?fi\b|enable wi-?fi/.test(t))
        return { command: 'wifion' }
      if (/\block\b/.test(t)) return { command: 'lock' }
      if (/\bsleep\b/.test(t)) return { command: 'sleep' }
      return null
    }
    case 'window.layout': {
      const exact = parseWindowLayout(text)
      if (exact) return exact
      const t = text.toLowerCase()
      if (/(?:next|other) (?:display|screen|monitor)/.test(t)) return { layout: 'nextdisplay' }
      if (/\balmost\b/.test(t)) return { layout: 'almost' }
      if (/maxim|full ?screen|fill|biggest/.test(t)) return { layout: 'maximize' }
      if (/cent(?:er|re)|middle/.test(t)) return { layout: 'center' }
      if (/\bleft\b/.test(t)) return { layout: 'left' }
      if (/\bright\b/.test(t)) return { layout: 'right' }
      if (/\btop\b|upper/.test(t)) return { layout: 'top' }
      if (/\bbottom\b|lower/.test(t)) return { layout: 'bottom' }
      return null
    }
    case 'dev.generate':
      return parseGenerator(text)
    case 'task.add': {
      const t = parseTask(/^(?:todo|task)\b/i.test(text) ? text : `todo ${text}`, now)
      return t ? { text: t.text, due: t.due } : null
    }
    case 'time.track': {
      const t = parseTracking(text)
      return t?.op === 'start' ? { project: t.project } : null
    }
    case 'emoji.pick':
      return {
        query: words(text, /^(?:emoji|find (?:an? )?emoji(?: for)?)\s*/i).slice(0, 40) || undefined
      }
    case 'search.all':
      return { query: text.slice(0, 200) }
    case 'note.send': {
      const c = parseCapture(text)
      return c ?? null
    }
    case 'dev.scratchpad':
      return { mode: /regex/i.test(text) ? 'regex' : /diff|compare/i.test(text) ? 'diff' : 'json' }
    case 'ports.manage':
      return { port: parsePorts(text)?.port }
    default:
      return {}
  }
}

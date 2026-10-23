import { describe, expect, it } from 'vitest'
import {
  expandQuicklink,
  layoutFrame,
  meetingLink,
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
  parseWindowLayout
} from '../src/shared/commands.js'
import {
  applyTransform,
  devConvert,
  explainCron,
  generate,
  parseColor,
  parseGenerator,
  parseTransform
} from '../src/shared/devtools.js'
import { extractRecurrence, parseEvent } from '../src/shared/timeparse.js'
import { worldClock, zoneOffsetMinutes } from '../src/shared/worldclock.js'

const NOW = new Date(2026, 9, 22, 10, 0, 0) // Thursday

describe('text transforms', () => {
  it('parses op + optional text (clipboard when absent)', () => {
    expect(parseTransform('base64 hello')).toEqual({ op: 'base64', text: 'hello' })
    expect(parseTransform('base64 decode aGVsbG8=')).toEqual({
      op: 'base64decode',
      text: 'aGVsbG8='
    })
    expect(parseTransform('slug')).toEqual({ op: 'slug' })
    expect(parseTransform('json')).toBeNull() // bare "json" opens the scratchpad instead
    expect(parseTransform('json {"a":1}')).toEqual({ op: 'json', text: '{"a":1}' })
    expect(parseTransform('hello world')).toBeNull()
  })
  it('transforms correctly, including unicode', () => {
    expect(applyTransform('base64', 'héllo ✓')).toBe('aMOpbGxvIOKckw==')
    expect(applyTransform('base64decode', 'aMOpbGxvIOKckw==')).toBe('héllo ✓')
    expect(applyTransform('urlencode', 'a b&c')).toBe('a%20b%26c')
    expect(applyTransform('urldecode', 'a+b%26c')).toBe('a b&c')
    expect(applyTransform('json', '{"a":[1,2]}')).toBe('{\n  "a": [\n    1,\n    2\n  ]\n}')
    expect(applyTransform('jsonmin', '{ "a" : 1 }')).toBe('{"a":1}')
    expect(applyTransform('slug', 'Héllo, World!  2026')).toBe('hello-world-2026')
    expect(applyTransform('camel', 'hello big_world')).toBe('helloBigWorld')
    expect(applyTransform('snake', 'helloBigWorld')).toBe('hello_big_world')
    expect(applyTransform('kebab', 'Hello Big World')).toBe('hello-big-world')
    expect(applyTransform('title', 'the quick FOX')).toBe('The Quick Fox')
    expect(applyTransform('count', 'one two\nthree')).toBe('3 words · 13 characters · 2 lines')
  })
  it('reports friendly errors', () => {
    expect(() => applyTransform('json', '{bad')).toThrow(/Invalid JSON/)
    expect(() => applyTransform('base64decode', '###')).toThrow(/valid Base64/)
    expect(() => applyTransform('urldecode', '%E0%A4%A')).toThrow(/URL encoding/)
  })
})

describe('generators', () => {
  const seq = (vals) => { let i = 0; return (n) => vals[i++ % vals.length] % n } // prettier-ignore
  it('parses specs', () => {
    expect(parseGenerator('uuid')).toEqual({ kind: 'uuid' })
    expect(parseGenerator('password 24')).toEqual({ kind: 'password', length: 24, symbols: true })
    expect(parseGenerator('password 12 simple')).toEqual({
      kind: 'password',
      length: 12,
      symbols: false
    })
    expect(parseGenerator('lorem 3 sentences')).toEqual({
      kind: 'lorem',
      count: 3,
      unit: 'sentence'
    })
    expect(parseGenerator('epoch 1700000000')).toEqual({ kind: 'epoch', value: 1700000000 })
    expect(parseGenerator('1700000000000')).toEqual({ kind: 'epoch', value: 1700000000000 })
    expect(parseGenerator('random 5-10')).toEqual({ kind: 'random', min: 5, max: 10 })
    expect(parseGenerator('random')).toEqual({ kind: 'random', min: 1, max: 100 })
    expect(parseGenerator('25')).toBeNull()
  })
  it('generates', () => {
    const pw = generate({ kind: 'password', length: 16, symbols: true }).value
    expect(pw).toHaveLength(16)
    expect(pw).toMatch(/[a-z]/)
    expect(pw).toMatch(/[A-Z]/)
    expect(pw).toMatch(/\d/)
    expect(pw).toMatch(/[!@#$%^&*\-_=+?]/)
    expect(generate({ kind: 'password', length: 10, symbols: false }).value).toMatch(
      /^[A-Za-z0-9]{10}$/
    )
    expect(generate({ kind: 'uuid' }).value).toMatch(/^[0-9a-f-]{36}$/)
    expect(generate({ kind: 'epoch', value: 0 }).value).toBe('1970-01-01T00:00:00.000Z')
    expect(generate({ kind: 'now' }, { now: 1_700_000_000_123 }).value).toBe('1700000000')
    expect(generate({ kind: 'random', min: 5, max: 6 }, { rand: seq([1]) }).value).toBe('6')
    expect(generate({ kind: 'lorem', count: 4, unit: 'word' }).value.split(' ')).toHaveLength(4)
  })
})

describe('dev conversions', () => {
  it('bases', () => {
    expect(devConvert('0xff')).toMatchObject({ title: '= 255', copyText: '255' })
    expect(devConvert('255 to hex')).toMatchObject({ copyText: '0xFF' })
    expect(devConvert('10 in binary')).toMatchObject({ copyText: '0b1010' })
    expect(devConvert('0b1010 to decimal')).toMatchObject({ copyText: '10' })
  })
  it('css units', () => {
    expect(devConvert('24px to rem')).toMatchObject({ copyText: '1.5rem' })
    expect(devConvert('2rem in px')).toMatchObject({ copyText: '32px' })
    expect(devConvert('20px to rem', { remBase: 10 })).toMatchObject({ copyText: '2rem' })
  })
  it('colours', () => {
    expect(devConvert('#ff8800')).toMatchObject({ copyText: 'rgb(255, 136, 0)', color: '#FF8800' })
    expect(devConvert('#f80 to hsl')).toMatchObject({ copyText: 'hsl(32, 100%, 50%)' })
    expect(devConvert('rgb(255, 0, 0) to hex')).toMatchObject({ copyText: '#FF0000' })
    expect(devConvert('hsl(120, 100%, 50%)')).toMatchObject({ copyText: '#00FF00' })
    expect(parseColor('#12345')).toBeNull()
    expect(parseColor('123456')).toBeNull() // plain digits are numbers, not colours
  })
  it('ignores non-matches', () => {
    for (const q of ['hello', '25m', '5 miles in km', '100 usd to eur', '12*(3+4)'])
      expect(devConvert(q), q).toBeNull()
  })
  it('explains cron', () => {
    expect(explainCron('cron */5 * * * *').title).toBe('Every 5 minutes')
    expect(explainCron('cron nope nope').invalid).toBe(true)
    expect(explainCron('hello')).toBeNull()
  })
})

describe('world clock', () => {
  it('offsets', () => {
    expect(zoneOffsetMinutes('Asia/Kolkata', new Date('2026-01-01T00:00:00Z'))).toBe(330)
    expect(zoneOffsetMinutes('America/New_York', new Date('2026-01-01T00:00:00Z'))).toBe(-300)
    expect(zoneOffsetMinutes('America/New_York', new Date('2026-07-01T00:00:00Z'))).toBe(-240)
  })
  it('current time somewhere', () => {
    const r = worldClock('time in tokyo', new Date('2026-10-22T03:00:00Z'))
    expect(r.title).toBe('12:00 PM in Tokyo')
    expect(worldClock('london time', new Date('2026-10-22T03:00:00Z')).title).toBe(
      '4:00 AM in London'
    )
    expect(worldClock('what time is it in nyc?', new Date('2026-10-22T03:00:00Z')).copyText).toBe(
      '11:00 PM'
    )
  })
  it('converts between zones, flagging day changes', () => {
    const r = worldClock('3pm pst in ist', new Date('2026-10-22T20:00:00Z'))
    expect(r.title).toBe('3:00 PM PST = 3:30 AM IST (Fri)')
    expect(worldClock('9:30 london to new york', new Date('2026-10-22T08:00:00Z')).copyText).toBe(
      '4:30 AM'
    )
  })
  it('ignores unknown places and nonsense', () => {
    expect(worldClock('time in atlantis')).toBeNull()
    expect(worldClock('3pm foo in bar')).toBeNull()
    expect(worldClock('25:00 utc in ist')).toBeNull()
  })
})

describe('command parsers', () => {
  it('weather', () => {
    expect(parseWeather('weather')).toEqual({ place: undefined, day: 'today' })
    expect(parseWeather('weather in paris')).toEqual({ place: 'paris', day: 'today' })
    expect(parseWeather('tokyo weather tomorrow')).toEqual({ place: 'tokyo', day: 'tomorrow' })
    expect(parseWeather('will it rain tomorrow?')).toEqual({ place: undefined, day: 'tomorrow' })
    expect(parseWeather('weathering with you')).toBeNull()
  })
  it('quick answers', () => {
    expect(parseAnswer('define serendipity')).toEqual({ kind: 'define', query: 'serendipity' })
    expect(parseAnswer('what does ephemeral mean?')).toEqual({ kind: 'define', query: 'ephemeral' })
    expect(parseAnswer('who is ada lovelace')).toEqual({ kind: 'wiki', query: 'ada lovelace' })
    expect(parseAnswer('what is a black hole')).toEqual({ kind: 'wiki', query: 'black hole' })
    expect(parseAnswer('what is 2+2')).toBeNull()
    expect(parseAnswer('what is on today')).toBeNull()
  })
  it('translate', () => {
    expect(parseTranslate('translate good morning to spanish')).toEqual({
      text: 'good morning',
      to: 'es'
    })
    expect(parseTranslate('tr fr thank you')).toEqual({ text: 'thank you', to: 'fr' })
    expect(parseTranslate('how do you say thanks in japanese')).toEqual({
      text: 'thanks',
      to: 'ja'
    })
    expect(parseTranslate('translate this to klingon')).toBeNull()
  })
  it('system', () => {
    expect(parseSystem('lock')).toEqual({ command: 'lock' })
    expect(parseSystem('volume 40')).toEqual({ command: 'volume', level: 40 })
    expect(parseSystem('set volume to 250%')).toEqual({ command: 'volume', level: 100 })
    expect(parseSystem('empty trash')).toEqual({ command: 'emptytrash' })
    expect(parseSystem('lockdown')).toBeNull()
  })
  it('tasks with due dates', () => {
    expect(parseTask('todo buy milk', NOW)).toEqual({ text: 'Buy milk', due: undefined })
    const t = parseTask('task call the bank by friday 3pm', NOW)
    expect(t.text).toBe('Call the bank')
    expect(new Date(t.due).getDay()).toBe(5)
    expect(parseTask('todo pay rent tomorrow', NOW).text).toBe('Pay rent')
    expect(parseTask('todo', NOW)).toBeNull()
  })
  it('tracking, meetings, ports, projects, contacts, shortcuts', () => {
    expect(parseTracking('track client work')).toEqual({ op: 'start', project: 'client work' })
    expect(parseTracking('stop tracking')).toEqual({ op: 'stop' })
    expect(parseTracking('timesheet')).toEqual({ op: 'report' })
    expect(parseMeeting('join')).toEqual({})
    expect(parseMeeting('join the club')).toBeNull()
    expect(parsePorts('kill 3000')).toEqual({ op: 'kill', port: 3000 })
    expect(parsePorts('port 8080')).toEqual({ op: 'list', port: 8080 })
    expect(parsePorts('ports')).toEqual({ op: 'list' })
    expect(parseProject('proj cast')).toEqual({ query: 'cast' })
    expect(parseContact('call mom')).toEqual({ via: 'call', query: 'mom' })
    expect(parseContact('email jane doe')).toEqual({ via: 'email', query: 'jane doe' })
    expect(parseContact('facetime sam')).toEqual({ via: 'facetime', query: 'sam' })
    expect(parseShortcut('run shortcut morning routine')).toEqual({ query: 'morning routine' })
  })
  it('meeting links', () => {
    expect(meetingLink({ hangoutLink: 'https://meet.google.com/abc-defg-hij' })).toBe(
      'https://meet.google.com/abc-defg-hij'
    )
    expect(meetingLink({ location: 'Zoom: https://us02web.zoom.us/j/123456789?pwd=abc).' })).toBe(
      'https://us02web.zoom.us/j/123456789?pwd=abc'
    )
    expect(
      meetingLink({ description: 'Join https://teams.microsoft.com/l/meetup-join/19%3a123 now' })
    ).toMatch(/^https:\/\/teams/)
    expect(meetingLink({ location: 'Room 4' })).toBeNull()
  })
  it('window layouts', () => {
    expect(parseWindowLayout('left half')).toEqual({ layout: 'left' })
    expect(parseWindowLayout('maximize')).toEqual({ layout: 'maximize' })
    const area = { x: 0, y: 25, width: 1440, height: 875 }
    expect(layoutFrame('right', area)).toEqual({ x: 720, y: 25, width: 720, height: 875 })
    expect(layoutFrame('center', area, { width: 800, height: 600 })).toEqual({
      x: 320,
      y: 163,
      width: 800,
      height: 600
    })
  })
  it('quick capture targets', () => {
    expect(parseCapture('obsidian: new idea')).toEqual({ target: 'obsidian', text: 'new idea' })
    expect(parseCapture('apple note: buy milk')).toEqual({ target: 'notes', text: 'buy milk' })
    expect(parseCapture('send meeting notes to notion')).toEqual({
      target: 'notion',
      text: 'meeting notes'
    })
  })
  it('docs search + quicklinks', () => {
    expect(parseDocs('npm react query')).toMatchObject({
      site: 'npm',
      url: 'https://www.npmjs.com/search?q=react%20query'
    })
    expect(parseDocs('gh prs')).toMatchObject({ url: 'https://github.com/pulls' })
    expect(parseDocs('hello world')).toBeNull()
    expect(expandQuicklink('https://jira.x.com/browse/{query}', 'ABC 1')).toBe(
      'https://jira.x.com/browse/ABC%201'
    )
    expect(expandQuicklink('https://x.com', 'ignored')).toBe('https://x.com')
  })
})

describe('recurring events', () => {
  it('extracts rules', () => {
    expect(extractRecurrence('standup every weekday 10am')).toMatchObject({
      rrule: 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
      rest: 'standup 10am'
    })
    expect(extractRecurrence('gym every monday and wednesday 7am').rrule).toBe(
      'RRULE:FREQ=WEEKLY;BYDAY=MO,WE'
    )
    expect(extractRecurrence('review every 2 weeks').rrule).toBe('RRULE:FREQ=WEEKLY;INTERVAL=2')
    expect(extractRecurrence('rent monthly').rrule).toBe('RRULE:FREQ=MONTHLY')
    expect(extractRecurrence('lunch friday').rrule).toBeNull()
  })
  it('flows into event drafts and starts on a matching day', () => {
    const sat = new Date(2026, 9, 24, 9, 0) // Saturday
    const e = parseEvent('standup every weekday 10am', sat)
    expect(e).toMatchObject({
      title: 'Standup',
      recurrence: 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
      recurrenceLabel: 'every weekday'
    })
    expect(e.start.getDay()).toBe(1) // moved to Monday
    expect(e.start.getHours()).toBe(10)
  })
})

describe('calendar heuristic stays out of other commands', () => {
  it('does not turn tasks, timezone conversions or tracking into events', () => {
    const now = new Date(2026, 9, 22, 10)
    expect(parseEvent('todo buy milk tomorrow 5pm', now)).toBeNull()
    expect(parseEvent('3pm pst in ist', now)).toBeNull()
    expect(parseEvent('track meeting prep at 3pm', now)).toBeNull()
    expect(parseEvent('lunch with sam thu 1pm', now)).not.toBeNull() // still works
    expect(parseEvent('schedule todo review friday 3pm', now)).not.toBeNull() // explicit keyword wins
  })
})

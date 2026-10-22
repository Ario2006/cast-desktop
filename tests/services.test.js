import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import ffmpegPath from 'ffmpeg-static'
import { toMp4, unpackedPath } from '../src/main/actions/convert.js'
import { createClipboardHistory } from '../src/main/clipboardHistory.js'
import { createCurrencyService } from '../src/main/currency.js'
import { createCalendarClient } from '../src/main/google/calendar.js'

const json = (b, status = 200) => new Response(JSON.stringify(b), { status })
const fakeClipboard = (init = '') => {
  const c = { text: init, formats: ['text/plain'] }
  return {
    _c: c,
    readText: () => c.text,
    writeText: (t) => (c.text = t),
    availableFormats: () => c.formats
  }
}

describe('clipboard history', () => {
  it('records new copies, de-duplicates, searches and copies back', () => {
    const cb = fakeClipboard('already here')
    const h = createClipboardHistory({ clipboard: cb })
    h.start()
    h.tick()
    expect(h.list()).toEqual([]) // what was on the clipboard at enable-time is not captured
    cb._c.text = 'first'
    h.tick()
    cb._c.text = 'second'
    h.tick()
    cb._c.text = 'first'
    h.tick()
    expect(h.list().map((i) => i.text)).toEqual(['first', 'second'])
    expect(h.list('SEC').map((i) => i.text)).toEqual(['second'])
    expect(h.copy(h.list()[1].id)).toBe(true)
    expect(cb._c.text).toBe('second')
    h.stop()
  })

  it('skips concealed (password manager), blank and oversized items; caps the list', () => {
    const cb = fakeClipboard()
    const h = createClipboardHistory({ clipboard: cb, max: 3 })
    cb._c.formats = ['text/plain', 'org.nspasteboard.ConcealedType']
    cb._c.text = 'hunter2'
    h.tick()
    cb._c.formats = ['text/plain']
    cb._c.text = '   '
    h.tick()
    cb._c.text = 'x'.repeat(20_000)
    h.tick()
    expect(h.list()).toEqual([])
    for (const t of ['a', 'b', 'c', 'd']) {
      cb._c.text = t
      h.tick()
    }
    expect(h.list().map((i) => i.text)).toEqual(['d', 'c', 'b'])
  })

  it('stop() wipes everything; polling only runs while enabled', () => {
    vi.useFakeTimers()
    const h = createClipboardHistory({ clipboard: fakeClipboard() })
    expect(vi.getTimerCount()).toBe(0)
    h.start()
    expect(vi.getTimerCount()).toBe(1)
    h.stop()
    expect(vi.getTimerCount()).toBe(0)
    expect(h.list()).toEqual([])
    vi.useRealTimers()
  })
})

describe('currency service', () => {
  const body = { date: '2026-10-22', rates: { USD: 1.1, INR: 106 } }

  it('fetches once, converts through EUR, and reuses the cache', async () => {
    const fetch = vi.fn().mockImplementation(async () => json(body))
    const svc = createCurrencyService({ fetch })
    const a = await svc.convert(100, 'USD', 'INR')
    expect(a.value).toBeCloseTo((100 * 106) / 1.1)
    expect(a).toMatchObject({ date: '2026-10-22', stale: false })
    await svc.convert(1, 'EUR', 'USD')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][0]).toContain('base=EUR')
  })

  it('refreshes after the TTL and falls back to stale rates when offline', async () => {
    let t = 0
    const fetch = vi.fn().mockImplementation(async () => json(body))
    const svc = createCurrencyService({ fetch, now: () => t })
    await svc.convert(1, 'EUR', 'USD')
    t += 7 * 3600_000
    await svc.convert(1, 'EUR', 'USD')
    expect(fetch).toHaveBeenCalledTimes(2)
    t += 7 * 3600_000
    fetch.mockRejectedValue(new TypeError('offline'))
    expect(await svc.convert(1, 'EUR', 'USD')).toMatchObject({ stale: true })
  })

  it('persists rates to disk so a fresh process works offline', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cast-rates-')), 'rates.json')
    await createCurrencyService({ file, fetch: async () => json(body) }).convert(1, 'EUR', 'USD')
    const offline = createCurrencyService({
      file,
      fetch: vi.fn().mockRejectedValue(new Error('x')),
      now: () => Date.now() + 99 * 3600_000
    })
    expect(await offline.convert(1, 'EUR', 'INR')).toMatchObject({ value: 106, stale: true })
  })

  it('reports clear errors', async () => {
    await expect(
      createCurrencyService({ fetch: vi.fn().mockRejectedValue(new Error('x')) }).convert(
        1,
        'EUR',
        'USD'
      )
    ).rejects.toMatchObject({ code: 'OFFLINE' })
    await expect(
      createCurrencyService({ fetch: async () => json({}, 500) }).convert(1, 'EUR', 'USD')
    ).rejects.toMatchObject({ code: 'RATES_UNAVAILABLE' })
    await expect(
      createCurrencyService({ fetch: async () => json({ rates: { USD: 'x' } }) }).convert(
        1,
        'EUR',
        'USD'
      )
    ).rejects.toMatchObject({ code: 'RATES_UNAVAILABLE' })
    await expect(
      createCurrencyService({ fetch: async () => json(body) }).convert(1, 'EUR', 'ZAR')
    ).rejects.toMatchObject({ code: 'UNSUPPORTED' })
  })
})

describe('calendar agenda', () => {
  it('merges events across calendars, sorts them, survives one failing calendar', async () => {
    const fetch = vi.fn().mockImplementation(async (url) => {
      const u = String(url)
      if (u.includes('calendarList'))
        return json({
          items: [
            { id: 'a', summary: 'Me', primary: true },
            { id: 'b', summary: 'Work' },
            { id: 'c', summary: 'Broken' }
          ]
        })
      if (u.includes('/calendars/a/'))
        return json({
          items: [
            {
              id: '1',
              summary: 'Lunch',
              start: { dateTime: '2026-10-22T12:00:00Z' },
              end: { dateTime: '2026-10-22T13:00:00Z' },
              htmlLink: 'https://x/1'
            }
          ]
        })
      if (u.includes('/calendars/b/'))
        return json({
          items: [
            {
              id: '2',
              summary: 'Standup',
              start: { dateTime: '2026-10-22T09:00:00Z' },
              end: { dateTime: '2026-10-22T09:15:00Z' },
              location: 'Zoom'
            },
            { id: '3', status: 'cancelled' },
            {
              id: '4',
              summary: 'Holiday',
              start: { date: '2026-10-22' },
              end: { date: '2026-10-23' }
            }
          ]
        })
      return json({ error: { message: 'nope' } }, 500)
    })
    const client = createCalendarClient({ auth: { getAccessToken: async () => 't' }, fetch })
    const out = await client.listAgenda({
      start: '2026-10-22T00:00:00Z',
      end: '2026-10-23T00:00:00Z'
    })
    expect(out.map((e) => e.title)).toEqual(['Holiday', 'Standup', 'Lunch'])
    expect(out.find((e) => e.title === 'Holiday').allDay).toBe(true)
    expect(out.find((e) => e.title === 'Standup')).toMatchObject({
      calendar: 'Work',
      location: 'Zoom'
    })
    expect(fetch.mock.calls[0][0].searchParams.get('minAccessRole')).toBe('reader')
  })
})

describe('mp4 conversion (real ffmpeg)', () => {
  it('turns a webm into a playable mp4 and cleans up on failure', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cast-ff-'))
    const webm = path.join(dir, 'in.webm')
    execFileSync(
      ffmpegPath,
      [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'testsrc=duration=1:size=160x120:rate=10',
        '-c:v',
        'libvpx',
        webm
      ],
      { stdio: 'ignore' }
    )
    const out = await toMp4({ ffmpeg: ffmpegPath, input: webm, output: path.join(dir, 'out.mp4') })
    expect(fs.statSync(out).size).toBeGreaterThan(500)
    // `ffmpeg -i file` always exits non-zero (no output given) but prints the stream info we want
    let info = ''
    try {
      execFileSync(ffmpegPath, ['-i', out], { stdio: 'pipe' })
    } catch (e) {
      info = String(e.stderr)
    }
    expect(info).toMatch(/Video: h264/)
    expect(info).toMatch(/yuv420p/)
    expect(info).toMatch(/Duration: 00:00:01/)
  }, 30_000)
})

describe('mp4 conversion helpers', () => {
  it('fails cleanly with no ffmpeg or a bad input, leaving no partial output', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cast-ff-'))
    await expect(
      toMp4({ ffmpeg: null, input: 'a', output: path.join(dir, 'x.mp4') })
    ).rejects.toThrow(/not available/)
    const bad = path.join(dir, 'bad.webm')
    fs.writeFileSync(bad, 'not a video')
    await expect(
      toMp4({ ffmpeg: ffmpegPath, input: bad, output: path.join(dir, 'x.mp4') })
    ).rejects.toBeTruthy()
    expect(fs.existsSync(path.join(dir, 'x.mp4'))).toBe(false)
  }, 30_000)
  it('maps asar paths to the unpacked location', () => {
    expect(
      unpackedPath('/A/Cast.app/Contents/Resources/app.asar/node_modules/ffmpeg-static/ffmpeg')
    ).toContain('app.asar.unpacked')
    expect(unpackedPath(null)).toBeNull()
  })
})

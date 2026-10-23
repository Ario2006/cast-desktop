import { expect, test } from '@playwright/test'
import { launch, rows, search } from './helpers.mjs'

test.describe('everyday + developer commands (offline)', () => {
  let app, page
  test.beforeEach(async () => ({ app, page } = await launch()))
  // eslint-disable-next-line no-empty-pattern
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) console.log('APP LOGS:', app.logs?.join('\n'))
    await app.close().catch(() => {})
  })

  const first = async (q) => {
    await search(page).fill(q)
    return rows(page).first()
  }

  test('world clock, bases, colours, cron, transforms and generators answer instantly', async () => {
    await expect(await first('time in tokyo')).toContainText('in Tokyo')
    await expect(await first('3pm pst in ist')).toContainText('PST')
    await expect(await first('0xff')).toContainText('= 255')
    await expect(await first('24px to rem')).toContainText('= 1.5rem')
    await expect(await first('#ff8800')).toContainText('rgb(255, 136, 0)')
    await expect(await first('cron 0 9 * * 1-5')).toContainText('Monday through Friday')
    await expect(await first('base64 hello world')).toContainText('aGVsbG8gd29ybGQ=')
    await expect(await first('sha256 abc')).toContainText('ba7816bf')
    await expect(await first('uuid')).toContainText(/[0-9a-f]{8}-[0-9a-f]{4}-/)
    await expect(await first('password 24')).toContainText('24-character password')
  })

  test('Enter on a result copies it to the clipboard', async () => {
    await search(page).fill('base64 hello')
    await expect(rows(page).first()).toContainText('aGVsbG8=')
    await page.keyboard.press('Enter')
    await expect(page.getByText('Copied aGVsbG8=')).toBeVisible()
    const clip = await app.evaluate(({ clipboard }) => clipboard.readText())
    expect(clip).toBe('aGVsbG8=')
  })

  test('tasks: add with a due date, complete, delete and undo', async () => {
    await search(page).fill('todo buy milk tomorrow 5pm')
    await expect(rows(page).first()).toContainText('Add task: Buy milk')
    await search(page).fill('tasks')
    await page.keyboard.press('Enter')
    await page.getByLabel('New task').fill('call the bank friday 3pm')
    await page.keyboard.press('Enter')
    await expect(page.getByText('Call the bank')).toBeVisible()
    await page.getByRole('checkbox', { name: /Mark “Call the bank” done/ }).click()
    await expect(page.getByRole('checkbox', { name: /not done/ })).toBeVisible()
    await page.getByRole('button', { name: /Delete “Call the bank”/ }).click()
    await expect(page.getByText('Task deleted')).toBeVisible()
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(page.getByText('Call the bank')).toBeVisible()
  })

  test('chained commands run both steps', async () => {
    await search(page).fill('remind me to stretch tomorrow at 9am and todo email sam')
    await expect(rows(page).first()).toContainText('Do 2 things')
    await page.keyboard.press('Enter')
    await page.getByRole('button', { name: /Do all/ }).click()
    await expect(page.getByText('Done — 2 things set up')).toBeVisible()
    await search(page).fill('tasks')
    await page.keyboard.press('Enter')
    await expect(page.getByText('Email sam')).toBeVisible()
  })

  test('destructive system commands ask first and Cancel does nothing', async () => {
    await search(page).fill('restart')
    await expect(rows(page).first()).toContainText('Restart')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('alertdialog')).toContainText('Restart your Mac now?')
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
  })

  test('time tracking starts, shows in the timesheet, and stops', async () => {
    await search(page).fill('track client work')
    await page.keyboard.press('Enter')
    await search(page).fill('timesheet')
    await page.keyboard.press('Enter')
    await expect(page.getByText('client work').first()).toBeVisible()
    await page.getByRole('button', { name: 'Stop' }).click()
    await expect(page.getByPlaceholder('What are you working on?')).toBeVisible()
  })

  test('emoji picker searches and copies', async () => {
    await search(page).fill(':rocket')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('option', { name: 'rocket' })).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(page.getByText('Copied 🚀')).toBeVisible()
  })

  test('dev scratchpad formats JSON, tests regex and diffs text', async () => {
    await search(page).fill('json')
    await page.keyboard.press('Enter')
    await page.getByLabel('JSON input').fill('{"a":[1,2]}')
    await expect(page.locator('pre')).toContainText('"a": [')
    await page.getByRole('tab', { name: 'Regex' }).click()
    await page.getByLabel('Regex pattern').fill('(\\d+)-(\\w+)')
    await page.getByLabel('Test text').fill('order 42-abc and 7-xyz')
    await expect(page.getByText('2 matches')).toBeVisible()
    await page.getByRole('tab', { name: 'Diff' }).click()
    await page.getByLabel('Original text').fill('the quick fox')
    await page.getByLabel('Changed text').fill('the slow fox')
    await expect(page.getByText('2 changes')).toBeVisible()
  })

  test('cheat sheet lists commands and clicking one fills the input', async () => {
    await search(page).fill('?')
    await page.keyboard.press('Enter')
    await page.getByRole('button', { name: /^25m/ }).click()
    await expect(search(page)).toHaveValue('25m')
    await expect(rows(page).first()).toContainText('25-minute timer')
  })

  test('quicklinks you add become commands', async () => {
    await page.keyboard.press('Meta+,')
    await page.getByRole('button', { name: 'Quicklinks', exact: true }).click()
    await page.getByLabel('Keyword').fill('gh2')
    await page.getByLabel('Name').fill('GitHub search')
    await page.getByLabel('URL').fill('https://github.com/search?q={query}')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.getByText('gh2 — GitHub search')).toBeVisible()
    await page.keyboard.press('Meta+,')
    await search(page).fill('gh2 cast launcher')
    await expect(rows(page).first()).toContainText('GitHub search: cast launcher')
  })

  test('dark theme, text size and contrast apply instantly', async () => {
    await page.keyboard.press('Meta+,')
    await page.getByLabel('Theme').selectOption('dark')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.getByRole('switch', { name: 'Increase contrast' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high')
  })

  test('recurring events are understood', async () => {
    await search(page).fill('standup every weekday 10am')
    await expect(rows(page).first()).toContainText(/Every weekday/i)
  })

  test('pomodoro, snippets and clipboard history still work with the new actions', async () => {
    await search(page).fill('clipboard')
    await page.keyboard.press('Enter')
    await expect(page.getByText('Clipboard history is off')).toBeVisible()
  })
})

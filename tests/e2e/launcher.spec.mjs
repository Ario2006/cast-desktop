import { expect, test } from '@playwright/test'
import { launch, rows, search } from './helpers.mjs'

test.describe('launcher', () => {
  let app, page
  test.beforeEach(async () => ({ app, page } = await launch()))
  // Playwright requires a destructured first argument here, even when no fixtures are used
  // eslint-disable-next-line no-empty-pattern
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) console.log('APP LOGS:', app.logs?.join('\n'))
    await app.close().catch(() => {})
  })

  test('shows local suggestions as you type (no network)', async () => {
    await search(page).fill('25m')
    await expect(rows(page).first()).toContainText('Start 25-minute timer')
    await search(page).fill('12*(3+4)')
    await expect(rows(page).first()).toContainText('= 84')
    await search(page).fill('5 miles in km')
    await expect(rows(page).first()).toContainText('= 8.04672 km')
  })

  test('Enter on a timer opens its widget; Esc goes back, then clears, then (hides)', async () => {
    await search(page).fill('25m')
    await page.keyboard.press('Enter')
    await expect(page.getByText('25:00').first()).toBeVisible()
    await page.keyboard.press('Escape') // widget -> list
    await expect(rows(page).first()).toContainText('25-minute timer')
    await page.keyboard.press('Escape') // clears the query
    await expect(search(page)).toHaveValue('')
  })

  test('arrow keys and ⌘N select suggestions', async () => {
    await search(page).fill('screenshot')
    await expect(rows(page).first()).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('ArrowDown')
    await expect(rows(page).nth(1)).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('ArrowUp')
    await expect(rows(page).first()).toHaveAttribute('aria-selected', 'true')
  })

  test('quick notes autosave', async () => {
    await search(page).fill('note buy milk and eggs')
    await page.keyboard.press('Enter')
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('textarea')).toHaveValue('buy milk and eggs')
  })

  test('reminders: parsed time, created, editable in plain English', async () => {
    await search(page).fill('remind me to call mom tomorrow at 5pm')
    await expect(rows(page).first()).toContainText('Remind me: Call mom')
    await page.keyboard.press('Enter')
    await expect(page.getByText('Call mom').first()).toBeVisible()
    await page.getByLabel('Change reminder').fill('tomorrow 9am')
    await page.keyboard.press('Enter')
    await expect(page.getByText(/9:00\s?AM/i).first()).toBeVisible()
  })

  test('timer can be changed with natural language', async () => {
    await search(page).fill('25m')
    await page.keyboard.press('Enter')
    await expect(page.getByText('25:00').first()).toBeVisible()
    await page.getByLabel('Edit timer').fill('make it 30 min')
    await page.keyboard.press('Enter')
    await expect(page.getByText(/^(30:00|29:5\d)$/).first()).toBeVisible()
  })

  test('pomodoro starts, skips to a break and stops', async () => {
    await search(page).fill('pomodoro')
    await page.keyboard.press('Enter')
    await page.getByRole('button', { name: /Start focus/ }).click()
    await expect(page.getByText('Focus', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: /Skip/ }).click()
    await expect(page.getByText('Short break', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Stop' }).click()
  })

  test('snippets can be created and found from the main input', async () => {
    await search(page).fill(';')
    await page.keyboard.press('Enter')
    await page.getByRole('button', { name: 'New' }).click()
    await page.getByPlaceholder('e.g. email signature').fill('sig')
    await page.getByPlaceholder('The text to copy…').fill('Best regards, Aryan')
    await page.keyboard.press('Meta+Enter')
    await expect(page.getByText('Best regards, Aryan')).toBeVisible()
    await page.keyboard.press('Escape')
    await search(page).fill('sig')
    await expect(rows(page).first()).toContainText('Snippet: sig')
  })

  test('settings open with ⌘, and changes persist', async () => {
    await page.keyboard.press('Meta+,')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await page.locator('select').selectOption('duckduckgo')
    await page.keyboard.press('Meta+,')
    await search(page).fill('g cats')
    await expect(rows(page).first()).toContainText('Search Google for')
    await search(page).fill('cats and dogs')
    await expect(rows(page).last()).toContainText('DuckDuckGo')
  })

  test('disabling an action removes it from suggestions', async () => {
    await page.keyboard.press('Meta+,')
    await page.getByRole('button', { name: 'Actions', exact: true }).click()
    await page.getByRole('switch', { name: 'Enable Start timer' }).click()
    await page.keyboard.press('Meta+,')
    await search(page).fill('25m')
    await expect(rows(page).filter({ hasText: 'timer' })).toHaveCount(0)
  })
})

test('first run shows the welcome walkthrough, then the launcher', async () => {
  const { app, page } = await launch({ onboarded: false })
  try {
    await expect(page.getByText('Welcome to Cast')).toBeVisible()
    await page.getByRole('button', { name: 'Get started' }).click()
    await expect(search(page)).toBeVisible()
  } finally {
    await app.close()
  }
})

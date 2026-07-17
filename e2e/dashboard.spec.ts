import { expect, test } from '@playwright/test'

test('redirects an unauthenticated user to login', async ({ page }) => {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto('/')

  await expect(page).toHaveURL(/\/login$/)
  await expect(
    page.getByRole('heading', { level: 1, name: '관리자 로그인' }),
  ).toBeVisible()
  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})

import { expect, test } from '@playwright/test'

test('redirects an unauthenticated user to login', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveURL(/\/login$/)
  await expect(
    page.getByRole('heading', { level: 1, name: '관리자 로그인' }),
  ).toBeVisible()
})

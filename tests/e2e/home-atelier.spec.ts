import { expect, test } from '@playwright/test'

test('Today starts focus from the contextual action', async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 8, 7, 10, 0, 0) })
  await page.goto('/')

  await page.getByRole('button', { name: 'Start focus' }).click()

  await expect(page.getByRole('heading', { name: /Focus/i })).toBeVisible()
})

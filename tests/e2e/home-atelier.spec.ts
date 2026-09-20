import { expect, test } from '@playwright/test'

test('Today starts focus from the contextual action', async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 8, 7, 10, 0, 0) })
  await page.goto('/')

  await page.getByRole('button', { name: 'Entrar em foco' }).click()

  await expect(page.getByRole('heading', { name: /Focus/i })).toBeVisible()
})

test('Agenda keeps availability visible in day and week modes', async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 8, 7, 8, 30, 0) })
  await page.goto('/')

  await page.getByRole('button', { name: 'Agenda', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Agenda availability' })).toBeVisible()
  await expect(page.getByText('Time planned')).toBeVisible()
  await expect(page.getByText('Next free window')).toBeVisible()

  await page.getByRole('tab', { name: 'Semana' }).click()
  await expect(page.getByRole('region', { name: 'Agenda availability' })).toBeVisible()
  await expect(page.getByText('Focus blocks')).toBeVisible()
})

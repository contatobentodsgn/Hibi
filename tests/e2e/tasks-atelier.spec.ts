import { expect, test } from '@playwright/test'

test('Tasks keeps its execution summary while completing a task', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Tarefas' }).click()

  await expect(page.getByRole('region', { name: 'Task execution summary' })).toBeVisible()
  await page.getByRole('button', { name: /Complete Kabrito Post 01/i }).click()
  await expect(page.getByRole('region', { name: 'Task execution summary' })).toBeVisible()
})

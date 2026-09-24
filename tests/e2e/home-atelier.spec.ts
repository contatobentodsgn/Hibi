import { expect, test } from '@playwright/test'

test('Hoje inicia foco pela ação contextual', async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 8, 7, 10, 0, 0) })
  await page.goto('/')

  await page.getByRole('button', { name: 'Entrar em foco' }).click()

  await expect(page.getByRole('region', { name: 'Foco', exact: true })).toBeVisible()
})

test('Hoje alterna entre semana e mês com uma série diária do período selecionado', async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 8, 17, 10, 0, 0) })
  await page.goto('/')

  const period = page.getByRole('group', { name: 'Período do tempo em foco' })
  const chart = page.getByRole('img', { name: 'Minutos de foco registrados por dia' })
  await expect(period.getByRole('button', { name: 'Semana' })).toHaveAttribute('aria-pressed', 'true')
  await expect(chart.locator('span')).toHaveCount(7)
  await period.getByRole('button', { name: 'Mês' }).click()
  await expect(period.getByRole('button', { name: 'Mês' })).toHaveAttribute('aria-pressed', 'true')
  await expect(chart.locator('span')).toHaveCount(30)
})

test('Agenda mantém o resumo de disponibilidade nos modos Dia e Semana', async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 8, 7, 8, 30, 0) })
  await page.goto('/')

  await page.getByRole('button', { name: 'Agenda', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Resumo da agenda' })).toBeVisible()
  await expect(page.getByText('Tempo planejado')).toBeVisible()
  await expect(page.getByText('Próxima janela livre')).toBeVisible()

  await page.getByRole('tab', { name: 'Semana' }).click()
  await expect(page.getByRole('region', { name: 'Resumo da agenda' })).toBeVisible()
  await expect(page.getByText('Blocos de foco')).toBeVisible()
})

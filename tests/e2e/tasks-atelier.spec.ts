import { expect, test } from '@playwright/test'

test('Tarefas mantém o resumo de execução ao concluir uma tarefa', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Tarefas', exact: true }).click()

  await expect(page.getByLabel('Resumo de execução das tarefas')).toBeVisible()
  await page.getByRole('button', { name: /Concluir Kabrito Post 01/i }).click()
  await expect(page.getByLabel('Resumo de execução das tarefas')).toBeVisible()
})

test('Tarefas edita, conclui e reabre pelo painel sem perder a alteração ao reiniciar', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Tarefas', exact: true }).click()

  await page.getByRole('button', { name: /Kabrito Post 01 60 min/i }).click()
  const panel = page.getByRole('dialog')
  await expect(panel).toBeVisible()
  await panel.getByRole('button', { name: 'Editar título' }).click()
  await panel.getByRole('textbox', { name: 'Título' }).fill('Kabrito Post 01 revisado')
  await panel.getByRole('button', { name: 'Salvar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Kabrito Post 01 revisado' })).toBeVisible()

  await panel.getByRole('button', { name: 'Concluir tarefa' }).click()
  await expect(panel.getByRole('button', { name: 'Reabrir tarefa' })).toBeVisible()
  await panel.getByRole('button', { name: 'Reabrir tarefa' }).click()
  await expect(panel.getByRole('button', { name: 'Concluir tarefa' })).toBeVisible()

  await page.reload()
  await page.getByRole('button', { name: 'Tarefas', exact: true }).click()
  await expect(page.getByRole('button', { name: /Kabrito Post 01 revisado 60 min/i })).toBeVisible()
})

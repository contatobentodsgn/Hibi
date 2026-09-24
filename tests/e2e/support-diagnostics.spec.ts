import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('diagnóstico local mostra estado essencial e exporta somente dados técnicos allowlisted', async ({ page }) => {
  const secrets = ['PRIVATE_CONVERSATION_73', 'PRIVATE_NOTE_91', 'PRIVATE_TITLE_42', '/Users/person/secret-model.gguf', 'API_KEY_DO_NOT_EXPORT'];
  await page.addInitScript((privateValues) => {
    (window as unknown as { pixanoDesktop: Record<string, unknown> }).pixanoDesktop = {
      info: async () => ({ name: 'Pixano', version: '2.4.1', localOnly: true }),
      getLocalModelState: async () => ({ status: 'ready', modelId: 'qwen3', sizeBytes: 1024, error: privateValues[3] }),
      getMicrophonePermission: async () => 'granted',
      getLocalVoiceState: async () => ({ status: 'ready', locale: 'pt-BR', error: privateValues[0] }),
      listIntegrationStatus: async () => [{ id: 'notion', label: 'Notion', state: 'connected', hasCredential: true, error: privateValues[4], lastSyncAt: privateValues[2] }],
    };
  }, secrets);
  await page.goto('/');
  const dock = page.getByRole('navigation', { name: 'Navegação principal' });
  await dock.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await page.getByRole('button', { name: /^Dados/ }).click();
  await expect(page.getByRole('heading', { name: 'Diagnóstico e privacidade' })).toBeVisible();
  await expect(page.getByText('2.4.1')).toBeVisible();
  await expect(page.getByText('Pronto e verificado')).toBeVisible();
  await expect(page.getByText('Permissão concedida')).toBeVisible();
  await expect(page.getByText('Conectada')).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exportar diagnóstico seguro' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('pixano-support-diagnostics.json');
  const text = await readFile(await download.path(), 'utf8');
  const bundle = JSON.parse(text) as Record<string, unknown>;
  expect(Object.keys(bundle).sort()).toEqual(['app', 'exportedAt', 'integrations', 'microphone', 'model', 'runtime', 'schemaVersion'].sort());
  for (const secret of secrets) expect(text).not.toContain(secret);
  expect(text).not.toContain('conversations');
  expect(text).not.toContain('notes');
  expect(text).not.toContain('tasks');
});

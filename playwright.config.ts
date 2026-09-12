import { defineConfig } from '@playwright/test';

// O e2e sobe o próprio Vite numa porta só dele, longe da 5173 do `npm run dev`. Com a porta fixa
// em 5173 e `reuseExistingServer: true`, o Playwright aproveitava em silêncio o dev server de
// outro worktree (ou do próprio, aberto para trabalhar) e testava um app diferente deste código.
// Agora, se algo já responde na porta, o Playwright aborta com "is already used" antes de rodar
// qualquer teste; e `--strictPort` faz o Vite sair com erro em vez de pular para a porta seguinte
// quando o ocupante não responde HTTP 2xx-403 e escapa dessa checagem.
// Para rodar o e2e em dois worktrees ao mesmo tempo de propósito: HIBI_E2E_PORT=<porta>.
const DEFAULT_E2E_PORT = 4273;
const rawPort = process.env.HIBI_E2E_PORT;
const port = rawPort ? Number(rawPort) : DEFAULT_E2E_PORT;
if (rawPort && (!/^\d+$/.test(rawPort) || port < 1024 || port > 65535)) {
  throw new Error(`HIBI_E2E_PORT deve ser um inteiro entre 1024 e 65535; recebido "${rawPort}".`);
}
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*\.spec\.ts/,
  testIgnore: /(^|[\\/])\._/,
  // O Playwright limpa o outputDir ao começar: duas execuções simultâneas não podem dividir a pasta.
  // Sem HIBI_E2E_PORT o caminho continua o mesmo que a CI publica quando falha.
  outputDir: rawPort ? `/tmp/hibi-playwright-results-${port}` : '/tmp/hibi-playwright-results',
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
  },
  use: { baseURL, headless: true },
});

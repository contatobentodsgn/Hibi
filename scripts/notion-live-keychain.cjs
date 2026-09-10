// Validação ao vivo do Notion com a credencial que o próprio Hibi guardou no Keychain.
// Roda dentro do Electron porque só o addon nativo do app lê esse item: o token nunca vai
// para variável de ambiente, histórico de shell ou relatório. `npm run test:notion:live`
// com HIBI_LIVE_NOTION_KEYCHAIN=1 — sem o opt-in, nada é lido nem escrito.
const { app } = require('electron');
const { createIntegrationManager } = require('../electron/integrations.cjs');
const { createNotionConnector } = require('../electron/connectors/notion.cjs');
const { createMacKeychain } = require('../electron/ai-config.cjs');

// A tarefa criada na validação manual de 2026-09-09 passa a ser a tarefa fixa do harness.
const LEGACY_VALIDATION_TITLES = ['Hibi validation task'];
// UUID bem formado que não aponta para página nenhuma.
const MISSING_PARENT_PAGE = '00000000-0000-4000-8000-000000000000';

async function run() {
  if (process.env.HIBI_LIVE_NOTION_KEYCHAIN !== '1') throw new Error('Set HIBI_LIVE_NOTION_KEYCHAIN=1 to validate against the real Notion workspace with the credential stored by Hibi.');
  const { runNotionLifecycle } = await import('./test-live-connectors.mjs');
  const manager = createIntegrationManager({ connectors: [createNotionConnector()], keychain: createMacKeychain(), fetch: globalThis.fetch });

  const report = { connection: (await manager.testConnection('notion')).ok };
  if (!report.connection) return { ...report, outcome: 'connection_failed' };

  const sources = (await manager.listImportTargets('notion')).filter((target) => target.label === 'Hibi Tasks');
  report.hibiTasksSources = sources.length;
  if (sources.length !== 1) return { ...report, outcome: 'hibi_tasks_not_unique' };

  // Caminho do setup. Antes da correção, a criação da base falhava localmente na segunda
  // preparação e nunca chegava ao Notion. Um pai inexistente prova que agora ela chega ao
  // serviço, e o Notion recusa sem criar nada — a validação não deixa base duplicada.
  const prepared = await manager.prepareAction({ connectorId: 'notion', kind: 'notion.database.create', payload: { parentPageId: MISSING_PARENT_PAGE } });
  try {
    const result = await manager.executeApproved({ actionId: prepared.id, confirmationId: prepared.confirmationId });
    report.setupPath = { reachedNotion: typeof result.status === 'number', status: result.status ?? null, created: result.ok === true };
  } catch (error) {
    report.setupPath = { reachedNotion: false, localError: error instanceof Error ? error.message.slice(0, 120) : 'failed' };
  }

  report.lifecycle = await runNotionLifecycle(manager, 'notion', sources[0].id, { adoptTitles: LEGACY_VALIDATION_TITLES });
  report.outcome = report.setupPath.reachedNotion && !report.setupPath.created && report.lifecycle.outcome === 'passed' ? 'passed' : 'failed';
  return report;
}

app.dock?.hide();
app.whenReady().then(async () => {
  let code = 0;
  try {
    const report = await run();
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.outcome !== 'passed') code = 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Live Notion validation failed.'}\n`);
    code = 1;
  }
  app.exit(code);
});

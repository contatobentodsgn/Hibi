import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Um arquivo que mudou de lugar precisa virar FAIL com o caminho, não derrubar o script com ENOENT
// antes de avaliar qualquer verificação: foi assim que este verificador ficou quebrado sem que
// ninguém notasse (lia `src/ui/AppShell.tsx` depois que o shell foi para `src/ui/shell/`).
const missing = [];

async function read(file) {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    missing.push(file);
    return '';
  }
}

// As rotas e os comandos são dados, não texto: importar o módulo confere a lista que o dock e a
// paleta de fato exibem. Procurar `'tasks'` no arquivo passaria só pelo union `NavKey`, mesmo com a
// rota fora do dock.
async function load(file) {
  try {
    return await import(pathToFileURL(path.resolve(file)).href);
  } catch (error) {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    missing.push(file);
    return {};
  }
}

const files = {
  app: await read('src/App.tsx'),
  home: await read('src/ui/HomeView.tsx'),
  day: await read('src/ui/DayView.tsx'),
  week: await read('src/ui/WeekView.tsx'),
  taby: await read('src/ui/TabyView.tsx'),
  shell: await read('src/ui/shell/AppShell.tsx'),
  dock: await read('src/ui/shell/Dock.tsx'),
  paletteTurn: await read('src/ui/palette/PaletteTurn.tsx'),
  assistantTurn: await read('src/ai/assistant-turn.ts'),
  localRuntime: await read('src/ai/local-runtime.ts'),
  preload: await read('electron/preload.cjs'),
  main: await read('electron/main.cjs'),
  aiContracts: await read('src/ai/contracts.ts'),
  aiConfig: await read('electron/ai-config.cjs'),
  policy: await read('src/ai/policy.ts'),
  companion: await read('src/companion/reducer.ts'),
  geometry: await read('electron/notch-geometry.cjs'),
};

const routes = await load('src/ui/shell/routes.ts');
const { PALETTE_COMMANDS = [] } = await load('src/ui/palette/commands.ts');

const navigable = new Set([...(routes.DOCK_ITEMS ?? []), ...(routes.MORE_ITEMS ?? [])].map((item) => item.key));
const commandRoute = new Map(PALETTE_COMMANDS.filter((command) => 'route' in command).map((command) => [command.key, command.route]));
const isAgendaRoute = routes.isAgendaRoute ?? (() => false);

const checks = [
  ['navigation: shell renders the dock', files.shell.includes('<Dock') && files.dock.includes('DOCK_ITEMS') && files.dock.includes('MORE_ITEMS'), 'AppShell → Dock → route lists'],
  ['navigation: tasks', navigable.has('tasks'), 'tasks in the dock or the ··· menu'],
  ['navigation: reminders', navigable.has('reminders'), 'reminders in the dock or the ··· menu'],
  ['navigation: calendar', navigable.has('agenda') && isAgendaRoute('day') && isAgendaRoute('week'), 'Agenda in the dock covers Day and Week'],
  ['navigation: focus', navigable.has('focus'), 'focus in the dock or the ··· menu'],
  ['navigation: notes/habits/goals/review', files.app.includes("case 'notes'") && files.app.includes("case 'habits'") && files.app.includes("case 'goals'") && files.app.includes("case 'review'"), 'data workspace routes'],
  ['commands: slash palette', commandRoute.get('/tasks') === 'tasks' && commandRoute.get('/reminders') === 'reminders', 'core slash commands open their routes'],
  ['desktop: notifications bridge', files.preload.includes('syncNotifications') && files.main.includes('hibi:notifications:sync'), 'native notification IPC'],
  ['desktop: launch at login', files.preload.includes('setOpenAtLogin') && files.main.includes('setLoginItemSettings'), 'login item IPC'],
  ['desktop: production bundle', files.main.includes('HIBI_PRODUCTION') && files.main.includes('loadFile'), 'offline production launch'],
  ['app: local persistence', files.app.includes('hibi-study-data') && files.app.includes('repository.exportJson'), 'local repository persistence'],
  ['app: reminder scheduling', files.app.includes('editReminderSchedule') && files.app.includes('createReminder'), 'reminder create/edit actions'],
  // `referenceDate(data)` saiu em c372d81 de propósito: as quatro telas queriam hoje, não o bloco mais
  // antigo do workspace. O invariante atual é o dia do calendário local de `date-context`: as telas
  // pedem `todayKey()`, e o assistente monta o dia com `localDateKey()` a partir do instante do pedido.
  ['dates: local calendar day', [files.home, files.day, files.week].every((source) => source.includes('domain/date-context') && source.includes('todayKey(')) && files.localRuntime.includes('domain/date-context') && files.localRuntime.includes('localDateKey(now)'), 'Home, Day, Week and the local assistant take the local day from date-context'],
  ['ai: provider-neutral contracts', files.aiContracts.includes('AiProvider') && files.aiContracts.includes('AiProviderProposal'), 'bounded AI provider contract'],
  ['ai: confirmation policy', files.policy.includes('Confirmation') && files.policy.includes('SHA-256'), 'single-use confirmation binding'],
  // A proveniência deixou de ser um rótulo fixo `Model:` e virou `provenanceLabel`, que junta provedor
  // e modelo, exibido pelo Taby e pela paleta.
  ['ai: secure configuration', files.aiConfig.includes('createMacKeychain') && files.aiConfig.includes('nativeKeychain') && files.preload.includes('saveAiConfig') && files.assistantTurn.includes('provenance.model') && files.taby.includes('provenanceLabel(') && files.paletteTurn.includes('provenanceLabel('), 'Keychain-backed provider configuration and model provenance'],
  ['companion: deterministic state', files.companion.includes('reduceCompanion') && files.companion.includes('requestId'), 'stale event guard'],
  ['notch: documented fallback', files.geometry.includes('BASE_WIDTH = 392') && files.main.includes('createNotchWindowManager'), 'Electron fallback placement'],
];

for (const file of missing) console.log(`FAIL file: ${file} — not found; checks that read it cannot pass`);
const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok, detail] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${detail}`);
if (failed.length || missing.length) process.exitCode = 1;
else console.log(`\nParity surface check passed: ${checks.length} invariants.`);

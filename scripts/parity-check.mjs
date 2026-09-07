import { readFile } from 'node:fs/promises';

const files = {
  app: await readFile('src/App.tsx', 'utf8'),
  home: await readFile('src/ui/HomeView.tsx', 'utf8'),
  day: await readFile('src/ui/DayView.tsx', 'utf8'),
  week: await readFile('src/ui/WeekView.tsx', 'utf8'),
  taby: await readFile('src/ui/TabyView.tsx', 'utf8'),
  shell: await readFile('src/ui/AppShell.tsx', 'utf8'),
  commands: await readFile('src/ui/CommandPalette.tsx', 'utf8'),
  preload: await readFile('electron/preload.cjs', 'utf8'),
  main: await readFile('electron/main.cjs', 'utf8'),
  aiContracts: await readFile('src/ai/contracts.ts', 'utf8'),
  aiConfig: await readFile('electron/ai-config.cjs', 'utf8'),
  policy: await readFile('src/ai/policy.ts', 'utf8'),
  companion: await readFile('src/companion/reducer.ts', 'utf8'),
  geometry: await readFile('electron/notch-geometry.cjs', 'utf8'),
};

const checks = [
  ['navigation: tasks', files.shell.includes("'tasks'"), 'AppShell tasks route'],
  ['navigation: reminders', files.shell.includes("'reminders'"), 'AppShell reminders route'],
  ['navigation: calendar', files.shell.includes("'week'") && files.shell.includes("'day'"), 'AppShell day/week routes'],
  ['navigation: focus', files.shell.includes("'focus'"), 'AppShell focus route'],
  ['navigation: notes/habits/goals/review', files.app.includes("case 'notes'") && files.app.includes("case 'habits'") && files.app.includes("case 'goals'") && files.app.includes("case 'review'"), 'data workspace routes'],
  ['commands: slash palette', files.commands.includes("'/tasks'") && files.commands.includes("'/reminders'"), 'core slash commands'],
  ['desktop: notifications bridge', files.preload.includes('syncNotifications') && files.main.includes('hibi:notifications:sync'), 'native notification IPC'],
  ['desktop: launch at login', files.preload.includes('setOpenAtLogin') && files.main.includes('setLoginItemSettings'), 'login item IPC'],
  ['desktop: production bundle', files.main.includes('HIBI_PRODUCTION') && files.main.includes('loadFile'), 'offline production launch'],
  ['app: local persistence', files.app.includes('hibi-study-data') && files.app.includes('repository.exportJson'), 'local repository persistence'],
  ['app: reminder scheduling', files.app.includes('editReminderSchedule') && files.app.includes('createReminder'), 'reminder create/edit actions'],
  ['dates: workspace-aware views', files.home.includes('referenceDate(data)') && files.day.includes('referenceDate(data)') && files.week.includes('referenceDate(data)') && files.taby.includes('referenceDate(data)'), 'views derive schedule dates'],
  ['ai: provider-neutral contracts', files.aiContracts.includes('AiProvider') && files.aiContracts.includes('AiProviderProposal'), 'bounded AI provider contract'],
  ['ai: confirmation policy', files.policy.includes('Confirmation') && files.policy.includes('SHA-256'), 'single-use confirmation binding'],
  ['ai: secure configuration', files.aiConfig.includes('createMacKeychain') && files.aiConfig.includes('nativeKeychain') && files.preload.includes('saveAiConfig') && files.taby.includes('Model:'), 'Keychain-backed provider configuration and model provenance'],
  ['companion: deterministic state', files.companion.includes('reduceCompanion') && files.companion.includes('requestId'), 'stale event guard'],
  ['notch: documented fallback', files.geometry.includes('BASE_WIDTH = 392') && files.main.includes('createNotchWindowManager'), 'Electron fallback placement'],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok, detail] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${detail}`);
if (failed.length) process.exitCode = 1;
else console.log(`\nParity surface check passed: ${checks.length} invariants.`);

import { readFile } from 'node:fs/promises';

const files = {
  app: await readFile('src/App.tsx', 'utf8'),
  shell: await readFile('src/ui/AppShell.tsx', 'utf8'),
  commands: await readFile('src/ui/CommandPalette.tsx', 'utf8'),
  preload: await readFile('electron/preload.cjs', 'utf8'),
  main: await readFile('electron/main.cjs', 'utf8'),
};

const checks = [
  ['navigation: tasks', files.shell.includes("'tasks'"), 'AppShell tasks route'],
  ['navigation: reminders', files.shell.includes("'reminders'"), 'AppShell reminders route'],
  ['navigation: calendar', files.shell.includes("'week'") && files.shell.includes("'day'"), 'AppShell day/week routes'],
  ['navigation: focus', files.shell.includes("'focus'"), 'AppShell focus route'],
  ['commands: slash palette', files.commands.includes("'/tasks'") && files.commands.includes("'/reminders'"), 'core slash commands'],
  ['desktop: notifications bridge', files.preload.includes('syncNotifications') && files.main.includes('hibi:notifications:sync'), 'native notification IPC'],
  ['desktop: launch at login', files.preload.includes('setOpenAtLogin') && files.main.includes('setLoginItemSettings'), 'login item IPC'],
  ['desktop: production bundle', files.main.includes('HIBI_PRODUCTION') && files.main.includes('loadFile'), 'offline production launch'],
  ['app: local persistence', files.app.includes('hibi-study-data') && files.app.includes('repository.exportJson'), 'local repository persistence'],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok, detail] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${detail}`);
if (failed.length) process.exitCode = 1;
else console.log(`\nParity surface check passed: ${checks.length} invariants.`);

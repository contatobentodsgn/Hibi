import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const routes = ['hoje', 'agenda', 'tarefas', 'notas', 'taby', 'lembretes', 'habitos', 'metas', 'revisao', 'stats'];
const out = '/tmp/hibi-visual-u10-u28';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
for (const [width, height, suffix] of [[1440, 1000, 'wide'], [900, 900, 'narrow']]) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
  for (const route of (width < 1000 ? routes.slice(0, 5) : routes)) {
    const visible = ['hoje', 'agenda', 'tarefas', 'notas', 'taby'].includes(route);
    const label = { hoje: 'Hoje', agenda: 'Agenda', tarefas: 'Tarefas', notas: 'Notas', taby: 'Taby' }[route];
    if (visible) {
      await page.locator('button:visible').filter({ hasText: label }).first().click();
    } else {
      await page.getByRole('button', { name: /Mais/ }).click();
      const labels = { lembretes: 'Lembretes', habitos: 'Hábitos', metas: 'Metas', revisao: 'Revisão', stats: 'Estatísticas' };
      await page.getByRole('menuitem', { name: labels[route], exact: true }).click();
    }
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${out}/${route}-${suffix}.png`, fullPage: true });
    console.log(route, suffix, (await page.locator('body').innerText()).slice(0, 80).replaceAll('\n', ' | '));
  }
  await page.close();
}
await browser.close();

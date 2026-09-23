import { spawn } from 'node:child_process';
import { existsSync, openSync, readSync, closeSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const devElectronAppPath = (root = fileURLToPath(new URL('..', import.meta.url))) =>
  `${root}node_modules/electron/dist/Electron.app`;

/**
 * Como abrir o Electron em desenvolvimento.
 *
 * O macOS responsabiliza pelas permissões **quem abriu** o processo. Lançado pelo terminal, o
 * responsável é o terminal, que não declara uso de microfone nem de fala: o helper de voz é morto
 * com SIGABRT e nenhum diálogo aparece. Aberto pelo Finder (`open`), o app responde por si mesmo e
 * o pedido de permissão aparece. Fora do macOS, ou sem o Electron baixado, segue o caminho antigo.
 */
export function devLaunchPlan({ platform = process.platform, electronAppPath = devElectronAppPath(), exists = existsSync } = {}) {
  if (platform !== 'darwin' || !exists(electronAppPath)) return { kind: 'npx' };
  return { kind: 'open', electronAppPath };
}

/** `--args` precisa vir por último: tudo depois dele é do app, não do `open`. */
export function devOpenArgs({ electronAppPath, projectRoot, logPath }) {
  return ['-W', '-a', electronAppPath, '--stdout', logPath, '--stderr', logPath, '--args', projectRoot];
}

export function launchDevElectron({ plan, projectRoot, logPath, devServer, spawnProcess = spawn }) {
  if (plan.kind === 'open') {
    return spawnProcess('open', devOpenArgs({ electronAppPath: plan.electronAppPath, projectRoot, logPath }), { stdio: 'inherit' });
  }
  return spawnProcess(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['electron', 'electron/main.cjs'], {
    stdio: 'inherit',
    env: { ...process.env, PIXANO_DEV_SERVER: devServer },
  });
}

/**
 * O app aberto pelo `open` não é filho deste processo: sem isto, sair do `npm run desktop` deixaria
 * uma janela órfã presa ao servidor do Vite que acabou de morrer.
 */
export function stopDevElectron({ plan, run = spawn }) {
  if (plan.kind !== 'open') return false;
  run('pkill', ['-f', `${plan.electronAppPath}/Contents/MacOS/Electron`], { stdio: 'ignore' });
  return true;
}

/** O `open` manda a saída para um arquivo; o terminal continua mostrando o que o app escreve. */
export function streamLog({ logPath, write = (text) => process.stdout.write(text), exists = existsSync, intervalMs = 200 }) {
  let offset = 0;
  const buffer = Buffer.alloc(64 * 1024);
  const timer = setInterval(() => {
    if (!exists(logPath)) return;
    let file;
    try {
      file = openSync(logPath, 'r');
      let read = readSync(file, buffer, 0, buffer.length, offset);
      while (read > 0) {
        write(buffer.toString('utf8', 0, read));
        offset += read;
        read = readSync(file, buffer, 0, buffer.length, offset);
      }
    } catch {
      // Um log que some ou trunca não pode derrubar o dev.
    } finally {
      if (file !== undefined) closeSync(file);
    }
  }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

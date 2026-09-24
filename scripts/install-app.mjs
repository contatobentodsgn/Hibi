import { execFileSync, execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_TARGET_DIR = path.join(homedir(), 'Applications');
const APP_NAME = 'Pixano.app';
const BUILT_APP = 'dist/mac-arm64/Pixano.app';

/** Substituir o pacote de um app aberto deixa a janela viva sobre arquivos que não existem mais. */
export function appIsRunning({ targetPath, run = execSync } = {}) {
  try {
    run(`pgrep -f ${JSON.stringify(`${targetPath}/Contents/MacOS/`)}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Instala neste Mac a versão que está no repositório.
 *
 * Enquanto o app não for assinado com identidade da Apple, o atualizador automático não tem como
 * aplicar nada: o macOS só troca um app por outro com a mesma assinatura. Até lá, receber uma
 * versão nova é isto — um comando, em vez de alguém gerar o pacote e arrastar à mão.
 */
export function installApp({
  projectRoot = fileURLToPath(new URL('..', import.meta.url)),
  targetDir = DEFAULT_TARGET_DIR,
  run = (file, args, options) => execFileSync(file, args, { stdio: 'inherit', ...options }),
  exists = existsSync,
  isRunning = appIsRunning,
  log = (message) => console.log(message),
} = {}) {
  const targetPath = path.join(targetDir, APP_NAME);
  if (isRunning({ targetPath })) {
    return { status: 'running', targetPath, message: `Feche o Pixano antes de instalar: ${targetPath} está aberto.` };
  }
  const env = { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false', PIXANO_LOCAL_INSTALL: '1' };
  run('npm', ['run', 'build'], { cwd: projectRoot, env });
  run('npx', ['electron-builder', '--mac', 'dir'], { cwd: projectRoot, env });
  const built = path.join(projectRoot, BUILT_APP);
  if (!exists(built)) return { status: 'missing-build', targetPath, message: `O empacotamento não deixou nada em ${built}.` };
  run('mkdir', ['-p', targetDir]);
  const stagingPath = path.join(targetDir, `.Pixano.app.install-${randomUUID()}`);
  const backupPath = path.join(targetDir, `.Pixano.app.backup-${randomUUID()}`);
  let previousMoved = false;
  let replacementMoved = false;
  try {
    run('cp', ['-R', built, stagingPath]);
    run('codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', stagingPath]);
    run('codesign', ['--verify', '--deep', '--strict', stagingPath]);
    if (exists(targetPath)) {
      run('mv', [targetPath, backupPath]);
      previousMoved = true;
    }
    run('mv', [stagingPath, targetPath]);
    replacementMoved = true;
  } catch (error) {
    try {
      if (replacementMoved) run('rm', ['-rf', targetPath]);
      if (previousMoved) run('mv', [backupPath, targetPath]);
      run('rm', ['-rf', stagingPath]);
    } catch (restoreError) {
      return { status: 'failed', targetPath, message: `A instalação falhou (${error.message}) e a restauração também falhou (${restoreError.message}). A versão anterior pode estar em ${backupPath}.` };
    }
    return { status: 'failed', targetPath, message: `A instalação falhou e a versão anterior foi preservada: ${error.message}` };
  }
  if (previousMoved) {
    try { run('rm', ['-rf', backupPath]); }
    catch { log(`A versão anterior foi mantida em ${backupPath}.`); }
  }
  log(`Pixano instalado em ${targetPath}.`);
  return { status: 'installed', targetPath };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  const result = installApp();
  if (result.status !== 'installed') {
    console.error(result.message);
    process.exitCode = 1;
  }
}

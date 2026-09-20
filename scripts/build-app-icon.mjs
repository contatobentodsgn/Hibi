// Compila o ícone do app (build/icon/Hibi.icon, formato do Icon Composer, com as versões clara e escura)
// no catálogo que o macOS lê (Assets.car) e no .icns para versões antigas. Precisa do Xcode 26 ou mais
// novo, que o empacotamento não exige: o resultado fica no repositório, e isto só roda quando o ícone muda.
//   npm run icon:build            (usa o Xcode ativo)
//   XCODE=/caminho/Xcode.app npm run icon:build
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const env = { ...process.env, ...(process.env.XCODE ? { DEVELOPER_DIR: join(process.env.XCODE, 'Contents/Developer') } : {}) };
const out = mkdtempSync(join(tmpdir(), 'hibi-icon-'));
try {
  execFileSync('xcrun', ['actool', join(root, 'build/icon/Hibi.icon'), '--compile', out, '--app-icon', 'Hibi', '--platform', 'macosx', '--minimum-deployment-target', '12.0', '--output-partial-info-plist', join(out, 'partial.plist'), '--errors', '--warnings'], { env, stdio: 'inherit' });
  copyFileSync(join(out, 'Assets.car'), join(root, 'build/icon/Assets.car'));
  copyFileSync(join(out, 'Hibi.icns'), join(root, 'build/icon/icon.icns'));
  console.log('Ícone compilado em build/icon (Assets.car e icon.icns).');
} finally {
  rmSync(out, { recursive: true, force: true });
}

import { readFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const registryPath = join(projectRoot, 'src/assets/companion-assets.ts');
const assetRoot = resolve(projectRoot, 'public/companion-assets');

const registrySource = await readFile(registryPath, 'utf8');
const registeredPaths = [...registrySource.matchAll(/\b(?:video|image)\('([^']+)'/g)].map(([, path]) => path);
const failures = [];

if (registeredPaths.length === 0) {
  failures.push(`No companion assets found in ${registryPath}`);
}

for (const assetPath of registeredPaths) {
  const normalizedPath = assetPath.replaceAll('\\', '/');
  const target = resolve(assetRoot, normalizedPath);
  const relativeTarget = relative(assetRoot, target);
  const isInsideAssetRoot = relativeTarget && !relativeTarget.startsWith(`..${sep}`) && !isAbsolute(relativeTarget);
  const isAppleDouble = normalizedPath.split('/').some((part) => part.startsWith('._'));
  const isQuarantined = /(?:^|\/rive\/talk\/)[^/]+\.(?:riv|wasm)$/i.test(normalizedPath) ||
    normalizedPath.startsWith('rive/talk/') && /\.(?:riv|wasm)$/i.test(normalizedPath);

  if (!isInsideAssetRoot) {
    failures.push(`${assetPath}: resolves outside public/companion-assets`);
    continue;
  }
  if (isAppleDouble) failures.push(`${assetPath}: AppleDouble metadata is not a runtime asset`);
  if (isQuarantined) failures.push(`${assetPath}: quarantined Rive/WASM asset is not a runtime asset`);

  try {
    const { stat } = await import('node:fs/promises');
    if (!(await stat(target)).isFile()) failures.push(`${assetPath}: does not resolve to a regular file`);
  } catch {
    failures.push(`${assetPath}: file is missing from public/companion-assets`);
  }
}

if (failures.length > 0) {
  console.error('Companion asset integrity check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Companion asset integrity check passed (${registeredPaths.length} registered assets).`);
}

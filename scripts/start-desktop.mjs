import { spawn } from 'node:child_process';
import process from 'node:process';
import http from 'node:http';
import { writeFileSync } from 'node:fs';
import { describeSpeechUsageString, ensureSpeechUsageString } from './dev-voice-permissions.mjs';
import { devLaunchPlan, launchDevElectron, stopDevElectron, streamLog } from './dev-electron-launch.mjs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

// The Electron process must never attach to a different, stale Vite server.
// Strictly owning this port makes an occupied port fail fast instead of silently
// validating a previous build.
const vite = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], { stdio: 'inherit' });
let electron;
let stopping = false;
const devServer = 'http://127.0.0.1:5173';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const plan = devLaunchPlan();
const logPath = path.join(tmpdir(), 'hibi-desktop.log');
let stopLog = () => {};

const stop = (code = 0) => {
  if (stopping) return;
  stopping = true;
  stopLog();
  vite.kill('SIGTERM');
  electron?.kill('SIGTERM');
  stopDevElectron({ plan });
  process.exit(code);
};

const waitForServer = (url, timeoutMs = 15_000) => new Promise((resolve, reject) => {
  const startedAt = Date.now();
  const probe = () => {
    const request = http.get(url, (response) => {
      response.resume();
      if (response.statusCode && response.statusCode < 500) return resolve();
      retry();
    });
    request.on('error', retry);
    request.setTimeout(500, () => request.destroy());
  };
  const retry = () => {
    if (Date.now() - startedAt >= timeoutMs) return reject(new Error(`Timed out waiting for ${url}`));
    setTimeout(probe, 100);
  };
  probe();
});

vite.on('exit', (code) => { if (code && code !== 143) stop(code); });
vite.on('error', () => stop(1));
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

// O Electron baixado não declara o texto de reconhecimento de fala, e sem ele o macOS mata o
// helper de voz assim que ele pede permissão. Um aviso basta: o resto do app roda sem voz.
if (process.platform === 'darwin') {
  const aviso = describeSpeechUsageString(ensureSpeechUsageString());
  if (aviso) console.log(aviso);
}

try {
  await waitForServer(devServer);
  if (plan.kind === 'open') { writeFileSync(logPath, ''); stopLog = streamLog({ logPath }); }
  electron = launchDevElectron({ plan, projectRoot, logPath, devServer });
  electron.on('error', () => stop(1));
  electron.on('exit', (code) => stop(code ?? 0));
} catch (error) {
  console.error(error.message);
  stop(1);
}

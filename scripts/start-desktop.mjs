import { spawn } from 'node:child_process';
import process from 'node:process';
import http from 'node:http';

const vite = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev', '--', '--host', '127.0.0.1'], { stdio: 'inherit' });
let electron;
let stopping = false;
const devServer = 'http://127.0.0.1:5173';

const stop = (code = 0) => {
  if (stopping) return;
  stopping = true;
  vite.kill('SIGTERM');
  electron?.kill('SIGTERM');
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

try {
  await waitForServer(devServer);
  electron = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['electron', 'electron/main.cjs'], {
    stdio: 'inherit',
    env: { ...process.env, HIBI_DEV_SERVER: devServer }
  });
  electron.on('error', () => stop(1));
  electron.on('exit', (code) => stop(code ?? 0));
} catch (error) {
  console.error(error.message);
  stop(1);
}

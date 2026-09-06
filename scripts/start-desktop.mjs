import { spawn } from 'node:child_process';
import process from 'node:process';

const vite = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev', '--', '--host', '127.0.0.1'], { stdio: 'inherit' });
const electron = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['electron', 'electron/main.cjs'], { stdio: 'inherit', env: { ...process.env, HIBI_DEV_SERVER: 'http://127.0.0.1:5173' } });
const stop = (code = 0) => { vite.kill('SIGTERM'); electron.kill('SIGTERM'); process.exit(code); };
vite.on('exit', (code) => { if (code && code !== 143) stop(code); });
electron.on('exit', (code) => stop(code ?? 0));
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

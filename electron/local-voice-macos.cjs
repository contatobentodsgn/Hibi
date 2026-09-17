const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');

const VOICES = { 'pt-BR': 'Luciana', 'en-US': 'Samantha' };
const HELPER = 'native/voice/build/hibi-voice';

/**
 * No app empacotado o helper mora nos recursos; em desenvolvimento, no repositório. Adivinhar pelo
 * `process.resourcesPath` escolhia, em desenvolvimento, uma pasta dentro do Electron baixado, onde
 * o helper nunca esteve: a voz morria com `ENOENT`. Então a escolha é pelo que existe, e o último
 * candidato é o que sobra para a mensagem de erro dizer onde se procurou.
 */
function resolveHelperPath({ exists = existsSync } = {}) {
  const candidates = [];
  if (process.resourcesPath) candidates.push(path.join(process.resourcesPath, HELPER));
  candidates.push(path.join(__dirname, '..', HELPER));
  return candidates.find((candidate) => exists(candidate)) ?? candidates[candidates.length - 1];
}

function createMacVoiceAdapter({ spawnProcess = spawn, helperPath, exists = existsSync } = {}) {
  const resolvedHelperPath = helperPath || resolveHelperPath({ exists });
  let child = null;
  return {
    listen({ locale = 'pt-BR', onText } = {}) {
      child?.kill('SIGTERM');
      child = spawnProcess(resolvedHelperPath, ['listen', locale], { stdio: ['ignore', 'pipe', 'ignore'] });
      child.stdout?.setEncoding('utf8');
      child.stdout?.on('data', (data) => data.split('\n').filter(Boolean).forEach((line) => { try { const event = JSON.parse(line); if (event.type === 'text') onText?.(event.text); } catch {} }));
      return new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code) => { child = null; code === 0 ? resolve() : reject(new Error(`macOS speech recognition exited with code ${code}`)); }); });
    },
    speak(text, { locale = 'pt-BR' } = {}) {
      child?.kill('SIGTERM');
      child = spawnProcess('say', ['-v', VOICES[locale] || VOICES['pt-BR'], text], { stdio: 'ignore' });
      return new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('close', (code, signal) => { child = null; code === 0 || signal === 'SIGTERM' ? resolve() : reject(new Error(`macOS speech exited with code ${code}`)); });
      });
    },
    stop() { child?.kill('SIGTERM'); child = null; },
  };
}

module.exports = { resolveHelperPath, createMacVoiceAdapter };

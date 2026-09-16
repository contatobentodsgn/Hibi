const { spawn } = require('node:child_process');
const path = require('node:path');

const VOICES = { 'pt-BR': 'Luciana', 'en-US': 'Samantha' };

function createMacVoiceAdapter({ spawnProcess = spawn, helperPath } = {}) {
  const resolvedHelperPath = helperPath || (process.resourcesPath && process.resourcesPath !== process.cwd()
    ? path.join(process.resourcesPath, 'native/voice/build/hibi-voice')
    : path.join(__dirname, '../native/voice/build/hibi-voice'));
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

module.exports = { createMacVoiceAdapter };

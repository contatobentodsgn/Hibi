const { spawn } = require('node:child_process');

const VOICES = { 'pt-BR': 'Luciana', 'en-US': 'Samantha' };

function createMacVoiceAdapter({ spawnProcess = spawn } = {}) {
  let child = null;
  return {
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

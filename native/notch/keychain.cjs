let addon;
try { addon = require('./build/Release/hibi_keychain.node'); } catch { addon = null; }

const unavailable = {
  available: () => false,
  set: () => { throw new Error('macOS Keychain bridge is unavailable.'); },
  get: () => { throw new Error('macOS Keychain bridge is unavailable.'); },
  has: () => false,
  remove: () => false,
};

module.exports = addon ?? unavailable;

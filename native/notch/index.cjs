let addon;
try { addon = require('./build/Release/hibi_notch.node'); } catch { addon = null; }
const unavailable = { available: () => false, promotionAvailable: () => false, screenGeometry: () => [], place: () => false, teardown: () => undefined };
const { createPublicNotchAdapter } = require('./adapters/public.cjs');

function createNotchAdapter({ mode = 'public', isPackaged = false, allowExperimental = false, platform = process.platform, bridge = addon ?? unavailable } = {}) {
  if (mode !== 'experimental') return createPublicNotchAdapter(bridge);
  if (isPackaged) return createPublicNotchAdapter(bridge, 'Experimental notch behavior is unavailable in packaged builds.');
  if (platform !== 'darwin' || !allowExperimental) return createPublicNotchAdapter(bridge, 'Experimental notch behavior requires explicit local macOS development opt-in.');
  // Lazy loading guarantees the isolated module is never evaluated by the public path.
  return require('./adapters/experimental.cjs').createExperimentalNotchAdapter(bridge);
}

const bridge = addon ?? unavailable;
module.exports = { ...bridge, createNotchAdapter };

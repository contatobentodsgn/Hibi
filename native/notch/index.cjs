let addon;
try { addon = require('./build/Release/hibi_notch.node'); } catch { addon = null; }
const unavailable = { available: () => false, promotionAvailable: () => false, screenGeometry: () => [], place: () => false, teardown: () => undefined };
module.exports = addon ?? unavailable;

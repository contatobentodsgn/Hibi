const { app, screen } = require('electron');
const nativeNotch = require('../native/notch/index.cjs');

const adapter = nativeNotch.createNotchAdapter({
  mode: 'public',
  isPackaged: false,
  platform: process.platform,
});

app.whenReady().then(() => {
  const requestedDisplayId = Number(process.env.HIBI_NATIVE_NOTCH_DISPLAY_ID);
  const display = screen.getAllDisplays().find((candidate) => candidate.id === requestedDisplayId) ?? screen.getPrimaryDisplay();
  const created = adapter.createHost(() => {});
  const shown = created && adapter.showHost({
    requestId: 'native-notch-smoke',
    kind: 'result',
    text: 'Native companion verification',
    interaction: 'passthrough',
    actions: [],
  }, display.id);

  setTimeout(() => {
    process.stdout.write(`${JSON.stringify({ created, shown, screens: adapter.screenGeometry(), diagnostics: adapter.hostDiagnostics() })}\n`);
    adapter.destroyHost();
    app.quit();
  }, 700);
});

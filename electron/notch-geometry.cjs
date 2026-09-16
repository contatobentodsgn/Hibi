const BASE_WIDTH = 392;
const BASE_HEIGHT = 296;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function scaleForDisplay(display) {
  const { width, height } = display.bounds;
  return clamp(Math.min(width / 1512, height / 982), 0.78, 0.94);
}

function notchBounds(display, size = 'normal') {
  const scale = scaleForDisplay(display);
  const sizeScale = size === 'compact' ? 0.85 : 1;
  const width = Math.round(BASE_WIDTH * scale * sizeScale);
  const height = Math.round(BASE_HEIGHT * scale * sizeScale);
  const { x, y, width: displayWidth } = display.bounds;
  return { x: Math.round(x + (displayWidth - width) / 2), y, width, height, scale };
}

function actionBounds(display, size = 'normal') {
  const visual = notchBounds(display, size);
  const height = Math.round(clamp(visual.height * 0.52, 96, 116));
  const gap = Math.round(clamp(visual.height * 0.08, 10, 16));
  return { x: visual.x - Math.round((visual.width * 0.55)), y: visual.y + visual.height + gap, width: visual.width + Math.round(visual.width * 1.1), height, scale: visual.scale };
}

function activationBounds(display) {
  const { x, y, width: displayWidth, height: displayHeight } = display.bounds;
  const width = Math.round(clamp(displayWidth * 0.19, 256, 320));
  const height = Math.round(clamp(displayHeight * 0.044, 38, 44));
  return { x: Math.round(x + (displayWidth - width) / 2), y, width, height };
}

// Ordem: o monitor escolhido, se conectado; senão a tela com câmera; senão a principal.
function resolveNotchDisplay(displays, primary, { preferredDisplayId = null, cameraHousingIds = [] } = {}) {
  const preferred = displays.find((display) => display.id === preferredDisplayId);
  if (preferred) return { display: preferred, reason: 'preferred' };
  const housing = displays.find((display) => cameraHousingIds.includes(display.id));
  if (housing) return { display: housing, reason: 'camera-housing' };
  return { display: primary, reason: 'primary' };
}

module.exports = { BASE_WIDTH, BASE_HEIGHT, scaleForDisplay, notchBounds, actionBounds, activationBounds, resolveNotchDisplay };

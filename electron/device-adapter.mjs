import { Buffer } from 'node:buffer';
import { createDeviceTransport } from './device-transport.mjs';

// O aparelho é um alvo pequeno do outro lado de um transporte serial: um pacote sem teto trava o
// dispositivo, não o Mac.
const MAX_SETTINGS_BYTES = 8_192;
const settingsMessage = (settings) => {
  const message = { type: 'settings', schema: settings?.schema, version: settings?.version, payload: settings?.payload };
  if (typeof message.schema !== 'string' || message.schema.length === 0 || message.schema.length > 120) return null;
  if (!Number.isInteger(message.version) || message.version < 1) return null;
  if (!message.payload || typeof message.payload !== 'object' || Array.isArray(message.payload)) return null;
  try {
    return Buffer.byteLength(JSON.stringify(message)) <= MAX_SETTINGS_BYTES ? message : null;
  } catch {
    return null;
  }
};

export const DEVICE_PROTOCOL_VERSION = 1;

export function createDeviceAdapter({ connect } = {}) {
  const transport = createDeviceTransport({ connect });
  let state = { status: 'unavailable', firmwareVersion: null, capabilities: [] };
  return {
    state: () => ({ ...state, capabilities: [...state.capabilities] }),
    async connect() {
      const response = await transport.request({ type: 'hello', version: DEVICE_PROTOCOL_VERSION });
      if (response?.type !== 'hello' || response.version !== DEVICE_PROTOCOL_VERSION) throw new Error('Unsupported device protocol.');
      state = { status: 'available', firmwareVersion: typeof response.firmwareVersion === 'string' ? response.firmwareVersion : null, capabilities: Array.isArray(response.capabilities) ? response.capabilities.filter((item) => typeof item === 'string').slice(0, 32) : [] };
      return this.state();
    },
    async sendSettings(settings) {
      if (state.status !== 'available') throw new Error('Device is unavailable.');
      const message = settingsMessage(settings);
      if (!message) throw new Error('Device settings are invalid.');
      return transport.request(message);
    },
    close() { transport.close(); state = { status: 'unavailable', firmwareVersion: null, capabilities: [] }; },
  };
}

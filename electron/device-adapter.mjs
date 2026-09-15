import { createDeviceTransport } from './device-transport.mjs';

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
    async sendSettings(settings) { if (state.status !== 'available') throw new Error('Device is unavailable.'); return transport.request({ type: 'settings', schema: settings?.schema, version: settings?.version, payload: settings?.payload }); },
    close() { transport.close(); state = { status: 'unavailable', firmwareVersion: null, capabilities: [] }; },
  };
}

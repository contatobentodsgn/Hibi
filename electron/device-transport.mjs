export function createDeviceTransport({ connect, timeoutMs = 2000 } = {}) {
  let connection = null;
  let timer = null;
  const close = () => { if (timer) clearTimeout(timer); timer = null; connection?.close?.(); connection = null; };
  return {
    async connect() {
      if (connection) return connection;
      if (typeof connect !== 'function') throw new Error('Device transport is unavailable.');
      connection = await Promise.race([connect(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Device connection timed out.')), timeoutMs); })]);
      if (timer) clearTimeout(timer); timer = null;
      return connection;
    },
    close,
    async request(message) {
      const active = await this.connect();
      if (!message || typeof message !== 'object') throw new Error('Invalid device message.');
      return active.request(message);
    },
  };
}

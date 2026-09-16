export function createDeviceTransport({ connect, timeoutMs = 2000 } = {}) {
  let connection = null;
  let timer = null;
  // O timer precisa sair também quando a conexão falha: armado, ele segura o event loop até o fim do
  // limite e rejeita uma promessa que ninguém mais espera.
  const clearTimer = () => { if (timer) clearTimeout(timer); timer = null; };
  const close = () => { clearTimer(); connection?.close?.(); connection = null; };
  return {
    async connect() {
      if (connection) return connection;
      if (typeof connect !== 'function') throw new Error('Device transport is unavailable.');
      try {
        connection = await Promise.race([connect(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Device connection timed out.')), timeoutMs); })]);
      } finally {
        clearTimer();
      }
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

function createRemoteNotificationConnector({ baseUrl = 'https://notifications.example.test/', request } = {}) {
  const url = new URL(baseUrl);
  const call = async (path, init, override) => (override ?? request)(new URL(path, url).toString(), init);
  return {
    id: 'remote-notifications', label: 'Remote notifications', allowedHosts: [url.hostname], capabilities: ['notify', 'write'],
    // Só consulta a saúde do endpoint; nenhum envio é disparado no teste.
    async testConnection({ credential, request: override }) {
      const response = await call('health', { method: 'GET', headers: { Authorization: `Bearer ${credential}` } }, override);
      if (!response?.ok) throw new Error('The notification endpoint rejected this credential.');
      return { ok: true, detail: 'Notification endpoint reachable and credential accepted.' };
    },
    prepareWrite(input) {
      const { title, body } = input?.payload ?? {};
      if (input?.kind !== 'notification.send' || typeof title !== 'string' || !title || title.length > 240 || typeof body !== 'string' || !body || body.length > 2_000) throw new Error('Invalid remote notification.');
      return { kind: 'notification.send', payload: { title, body } };
    },
    async executeApproved({ kind, payload, credential, request: override }) {
      const prepared = this.prepareWrite({ kind, payload });
      return call('send', { method: 'POST', headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' }, body: JSON.stringify(prepared.payload) }, override);
    },
  };
}

module.exports = { createRemoteNotificationConnector };

function createRemoteNotificationConnector({ baseUrl = 'https://notifications.example.test/', request } = {}) {
  const url = new URL(baseUrl);
  const call = async (path, init, override) => (override ?? request)(new URL(path, url).toString(), init);
  return {
    id: 'remote-notifications', label: 'Remote notifications', allowedHosts: [url.hostname], capabilities: ['notify', 'write'],
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

function createEmailConnector({ baseUrl = 'https://mail.example.test/', request } = {}) {
  const url = new URL(baseUrl);
  const call = async (path, init, override) => (override ?? request)(new URL(path, url).toString(), init);
  return {
    id: 'email', label: 'Email', allowedHosts: [url.hostname], capabilities: ['import', 'write'],
    oauth: { pkce: true, authorizationUrl: 'https://mail.example.test/oauth/authorize', tokenUrl: 'https://mail.example.test/oauth/token', scopes: ['mail.read', 'mail.send'] },
    normalizeImport(message) {
      if (!message || message.flagged !== true || typeof message.id !== 'string' || !message.id) return null;
      return { remoteId: message.id, ...(typeof message.updatedAt === 'string' ? { revision: message.updatedAt } : {}), title: typeof message.subject === 'string' && message.subject.trim() ? message.subject.trim().slice(0, 240) : 'Flagged email', kind: 'email', ...(typeof message.from === 'string' ? { source: message.from.slice(0, 240) } : {}) };
    },
    prepareWrite(input) {
      const { to, subject, text } = input?.payload ?? {};
      if (input?.kind !== 'email.send' || typeof to !== 'string' || !to || typeof subject !== 'string' || !subject || typeof text !== 'string' || !text || text.length > 20_000) throw new Error('Invalid email message.');
      return { kind: 'email.send', payload: { to, subject, text } };
    },
    async executeApproved({ kind, payload, credential, request: override }) {
      const prepared = this.prepareWrite({ kind, payload });
      return call('send', { method: 'POST', headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' }, body: JSON.stringify(prepared.payload) }, override);
    },
  };
}

module.exports = { createEmailConnector };

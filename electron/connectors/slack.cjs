function createSlackConnector({ baseUrl = 'https://slack.com/api/', request } = {}) {
  const url = new URL(baseUrl);
  const call = async (path, init, override) => (override ?? request)(new URL(path, url).toString(), init);
  return {
    id: 'slack', label: 'Slack', allowedHosts: [url.hostname], capabilities: ['import', 'write', 'sync'],
    oauth: { pkce: true, authorizationUrl: 'https://slack.com/oauth/v2/authorize', tokenUrl: 'https://slack.com/api/oauth.v2.access', scopes: ['chat:write', 'stars:read'] },
    normalizeImport(item) {
      if (!item || typeof item.id !== 'string' || !item.id || item.saved !== true && item.starred !== true) return null;
      return { remoteId: item.id, ...(typeof item.updatedAt === 'string' ? { revision: item.updatedAt } : {}), title: typeof item.text === 'string' ? item.text.slice(0, 240) : 'Saved Slack item', kind: 'task', ...(typeof item.channel === 'string' ? { source: item.channel } : {}) };
    },
    prepareWrite(input) {
      const channel = input?.payload?.channel; const text = input?.payload?.text;
      if (input?.kind !== 'slack.post' || typeof channel !== 'string' || !channel || typeof text !== 'string' || !text || text.length > 4_000) throw new Error('Invalid Slack message.');
      return { kind: 'slack.post', payload: { channel, text } };
    },
    async executeApproved({ kind, payload, credential, request: override }) {
      const prepared = this.prepareWrite({ kind, payload });
      return call('chat.postMessage', { method: 'POST', headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' }, body: JSON.stringify(prepared.payload) }, override);
    },
  };
}

module.exports = { createSlackConnector };

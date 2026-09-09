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
    // auth.test apenas valida o token; não publica nada.
    async testConnection({ credential, request: override }) {
      const response = await call('auth.test', { method: 'GET', headers: { Authorization: `Bearer ${credential}` } }, override);
      const body = response?.ok ? await response.json().catch(() => ({})) : {};
      if (body?.ok !== true) throw new Error('Slack rejected this credential.');
      return { ok: true, detail: typeof body.team === 'string' && body.team ? `Connected to ${body.team.slice(0, 120)}.` : 'Credential accepted by Slack.' };
    },
    async listImportTargets({ credential, request: override }) {
      const response = await call('conversations.list?limit=200&exclude_archived=true', { method: 'GET', headers: { Authorization: `Bearer ${credential}` } }, override);
      const body = response?.ok ? await response.json().catch(() => ({})) : {};
      if (body?.ok !== true) throw new Error('Slack could not list channels.');
      return (Array.isArray(body.channels) ? body.channels : []).flatMap((channel) => typeof channel?.id === 'string' && channel.id ? [{ id: channel.id, label: typeof channel.name === 'string' && channel.name ? `#${channel.name.slice(0, 120)}` : channel.id }] : []);
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

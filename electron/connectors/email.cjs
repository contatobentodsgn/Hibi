// Este conector não tem serviço padrão: `mail.example.test` é um placeholder que
// não existe. Por isso ele não traz OAuth embutido — anunciar um fluxo que nunca
// poderia completar é pior do que não anunciar nenhum. O OAuth aqui só existe
// quando a pessoa configura as URLs do próprio serviço, e as permissões ficam a
// cargo dele: o Hibi não inventa nomes de escopo para um servidor arbitrário.
function createEmailConnector({ baseUrl = 'https://mail.example.test/', request, oauth } = {}) {
  const url = new URL(baseUrl);
  const call = async (path, init, override) => (override ?? request)(new URL(path, url).toString(), init);
  return {
    id: 'email', label: 'Email', allowedHosts: [url.hostname], capabilities: ['import', 'write'],
    ...(oauth ? { oauth: { pkce: true, ...oauth } } : {}),
    normalizeImport(message) {
      if (!message || message.flagged !== true || typeof message.id !== 'string' || !message.id) return null;
      return { remoteId: message.id, ...(typeof message.updatedAt === 'string' ? { revision: message.updatedAt } : {}), title: typeof message.subject === 'string' && message.subject.trim() ? message.subject.trim().slice(0, 240) : 'Flagged email', kind: 'email', ...(typeof message.from === 'string' ? { source: message.from.slice(0, 240) } : {}) };
    },
    async testConnection({ credential, request: override }) {
      const response = await call('profile', { method: 'GET', headers: { Authorization: `Bearer ${credential}` } }, override);
      if (!response?.ok) throw new Error('The mail service rejected this credential.');
      const body = await response.json().catch(() => ({}));
      return { ok: true, detail: typeof body?.address === 'string' && body.address ? `Connected as ${body.address.slice(0, 120)}.` : 'Credential accepted by the mail service.' };
    },
    async listImportTargets({ credential, request: override }) {
      const response = await call('mailboxes', { method: 'GET', headers: { Authorization: `Bearer ${credential}` } }, override);
      if (!response?.ok) throw new Error('The mail service could not list mailboxes.');
      const body = await response.json().catch(() => ({}));
      return (Array.isArray(body?.mailboxes) ? body.mailboxes : []).flatMap((mailbox) => typeof mailbox?.id === 'string' && mailbox.id ? [{ id: mailbox.id, label: typeof mailbox.name === 'string' && mailbox.name ? mailbox.name.slice(0, 120) : mailbox.id }] : []);
    },
    // Somente mensagens sinalizadas, e somente das caixas escolhidas.
    async fetchImports({ credential, request: override, targets = [], limit = 50 }) {
      const messages = [];
      for (const target of targets.slice(0, 20)) {
        const response = await call(`messages?mailbox=${encodeURIComponent(target.id)}&flagged=true&limit=${Math.min(limit, 200)}`, { method: 'GET', headers: { Authorization: `Bearer ${credential}` } }, override);
        if (!response?.ok) throw new Error('The mail service could not read one of the selected mailboxes.');
        const body = await response.json().catch(() => ({}));
        for (const message of Array.isArray(body?.messages) ? body.messages : []) messages.push(message);
      }
      return messages;
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

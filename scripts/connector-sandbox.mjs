// Sandbox dos conectores `email` e `remote-notifications`, para reproduzir os itens 3 e 4 da Fase 3.
//
// Esses dois conectores não falam nenhuma API de mercado: eles definem o contrato abaixo. Sem um
// servidor que o implemente, não há contra o que validá-los.
//
//   e-mail        GET  mail/profile              -> { address }
//                 GET  mail/mailboxes            -> { mailboxes: [{ id, name }] }
//                 GET  mail/messages?flagged=true-> { messages: [...] }   (só as sinalizadas importam)
//                 POST mail/send                 <- { to, subject, text }
//   notificações  GET  notify/health
//                 POST notify/send               <- { title, body }
//
// Todas exigem `Authorization: Bearer $SANDBOX_TOKEN`; sem ela a resposta é 401, o que também serve
// para exercitar o caminho de credencial recusada.
//
// ATENÇÃO ao ler qualquer relatório gerado contra esta sandbox: ela prova a fiação do Hibi (HTTPS,
// allowlist, credencial, confirmação, auditoria, relatório sanitizado) e NÃO compatibilidade com um
// serviço real — foi escrita a partir do mesmo contrato que o conector implementa, então tende a
// concordar com ele por construção.
//
// Como reproduzir:
//   1. SANDBOX_TOKEN=$(openssl rand -hex 16) node scripts/connector-sandbox.mjs
//   2. exponha a porta 8787 em HTTPS (o harness recusa HTTP), por exemplo com um túnel
//   3. rode o harness apontando HIBI_LIVE_CONNECTOR_ENDPOINT para <url>/mail/ ou <url>/notify/,
//      com HIBI_LIVE_CONNECTOR_ALLOW_HOSTS igual ao host e HIBI_LIVE_CONNECTOR_TOKEN igual ao token
import { createServer } from 'node:http'

const PORT = Number(process.env.PORT ?? 8787)
const TOKEN = process.env.SANDBOX_TOKEN
if (!TOKEN) { console.error('Defina SANDBOX_TOKEN antes de subir a sandbox.'); process.exit(1) }

const log = []
const json = (res, status, body) => {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) })
  res.end(payload)
}
const readBody = async (req) => {
  const chunks = []
  for await (const chunk of req) { chunks.push(chunk); if (chunks.reduce((total, item) => total + item.length, 0) > 64_000) throw new Error('corpo grande demais') }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { return null }
}

// Duas mensagens, uma sinalizada: é o bastante para provar que a importação filtra por `flagged`.
const MESSAGES = [
  { id: 'sandbox-1', subject: 'Revisar proposta da semana', updatedAt: '2026-09-11T09:00:00.000Z', from: 'equipe@example.test', flagged: true },
  { id: 'sandbox-2', subject: 'Newsletter (não sinalizada)', updatedAt: '2026-09-11T09:05:00.000Z', from: 'news@example.test', flagged: false },
]

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const path = url.pathname.replace(/\/+$/, '') || '/'
  const authorized = req.headers.authorization === `Bearer ${TOKEN}`
  log.push({ at: new Date().toISOString(), method: req.method, path, authorized })
  console.log(`${authorized ? 'ok  ' : '401 '} ${req.method} ${path}`)

  if (path === '/__log') return json(res, 200, { requests: log })
  if (!authorized) return json(res, 401, { error: 'credencial recusada pela sandbox' })

  if (req.method === 'GET' && path === '/mail/profile') return json(res, 200, { address: 'hibi-sandbox@example.test' })
  if (req.method === 'GET' && path === '/mail/mailboxes') return json(res, 200, { mailboxes: [{ id: 'inbox', name: 'Inbox' }, { id: 'clients', name: 'Clientes' }] })
  if (req.method === 'GET' && path === '/mail/messages') {
    const flaggedOnly = url.searchParams.get('flagged') === 'true'
    return json(res, 200, { messages: MESSAGES.filter((message) => !flaggedOnly || message.flagged) })
  }
  if (req.method === 'POST' && path === '/mail/send') {
    const body = await readBody(req)
    if (!body || typeof body.to !== 'string' || typeof body.subject !== 'string' || typeof body.text !== 'string') return json(res, 400, { error: 'mensagem inválida' })
    return json(res, 200, { ok: true, id: `sent-${log.length}` })
  }

  if (req.method === 'GET' && path === '/notify/health') return json(res, 200, { ok: true })
  if (req.method === 'POST' && path === '/notify/send') {
    const body = await readBody(req)
    if (!body || typeof body.title !== 'string' || typeof body.body !== 'string') return json(res, 400, { error: 'notificação inválida' })
    return json(res, 200, { ok: true, id: `notified-${log.length}` })
  }

  return json(res, 404, { error: 'caminho desconhecido' })
})

server.listen(PORT, '127.0.0.1', () => console.log(`sandbox dos conectores em http://127.0.0.1:${PORT} (mail/ e notify/)`))

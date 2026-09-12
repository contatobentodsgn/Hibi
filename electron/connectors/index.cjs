const { createNotionConnector } = require('./notion.cjs');
const { createSlackConnector } = require('./slack.cjs');
const { createEmailConnector } = require('./email.cjs');
const { createRemoteNotificationConnector } = require('./remote-notifications.cjs');
const { createGoogleCalendarConnector } = require('./google-calendar.cjs');

// Um endpoint configurado troca a base do conector e, com ela, o allowlist de
// hosts: nenhuma outra origem passa a ser permitida por causa disso.
//
// As URLs de OAuth não são derivadas dessa base. O servidor de autorização de um
// serviço real quase nunca mora no host da API, e adivinhar `/oauth/authorize`
// num endpoint arbitrário inventaria um contrato que não existe. Elas são
// configuradas à parte, ao lado do endpoint; sem elas, um endpoint próprio
// simplesmente não tem OAuth — e a interface diz isso em vez de falhar.
function oauthOverrideFor(entry) {
  if (!entry.authorizationUrl || !entry.tokenUrl) return null;
  return {
    authorizationUrl: entry.authorizationUrl,
    tokenUrl: entry.tokenUrl,
    // O allowlist de `oauthConfigFor` continua valendo; o que ele passa a conter
    // são os hosts que a pessoa configurou e que `normalizeOauthUrl` já validou
    // (HTTPS, sem credencial embutida, sem query nem fragmento) na gravação.
    allowedHosts: [new URL(entry.authorizationUrl).hostname.toLowerCase(), new URL(entry.tokenUrl).hostname.toLowerCase()],
  };
}

function connectorOptionsFor(settings, connectorId) {
  const entry = settings.get(connectorId);
  const oauth = oauthOverrideFor(entry);
  if (oauth) return { ...(entry.endpoint ? { baseUrl: entry.endpoint } : {}), oauth };
  // `null` desliga o OAuth embutido: ele pertence ao serviço padrão, não a este endpoint.
  return entry.endpoint ? { baseUrl: entry.endpoint, oauth: null } : {};
}

function buildConnectors(settings) {
  return [
    createNotionConnector(connectorOptionsFor(settings, 'notion')),
    createSlackConnector(connectorOptionsFor(settings, 'slack')),
    createEmailConnector(connectorOptionsFor(settings, 'email')),
    createRemoteNotificationConnector(connectorOptionsFor(settings, 'remote-notifications')),
    createGoogleCalendarConnector(connectorOptionsFor(settings, 'google-calendar')),
  ];
}

module.exports = { buildConnectors, connectorOptionsFor };

// O portão de foco: a única função que decide se um alerta sai agora, mais tarde, ou mais tarde ainda.
//
// POR QUE ELE MORA AQUI, AO LADO DO AGENDADOR
// A tela de Foco sempre prometeu "lembretes ficam quietos durante o foco, exceto os importantes", e
// nada cumpria: `grep focus electron/notifications.cjs electron/main.cjs` voltava vazio. O agendador é
// o único lugar que decide QUANDO algo dispara — ele é dono dos timers. Um portão no renderer só
// conseguiria esconder o alerta depois de a notificação nativa já ter tocado. Por isso a decisão
// desce até aqui, e o renderer manda apenas o CONTEXTO (janela de foco e ajustes) junto das entradas.
//
// POR QUE ADIAR EM VEZ DE DESCARTAR
// Silenciar não pode significar perder. Um lembrete retido durante a sessão dispara quando a sessão
// acaba; um que vence fora do horário ativo dispara na abertura do próximo horário ativo. Jogar o
// lembrete fora para proteger a concentração seria uma troca pior — e ninguém pediu por ela.
//
// POR QUE A PRÉVIA COMPARTILHA ESTA FUNÇÃO
// No app original o horário ativo dizia 09:00–17:00 e o calendário materializava marcadores quase o
// dia inteiro: gerar, exibir e disparar moravam em lugares diferentes, então a tela virou enfeite.
// Aqui `countDailyAlerts` não estima nada — ela chama `nextDelivery`, a MESMA função que o agendador
// chama para armar cada timer. Uma prévia que pudesse discordar da realidade é exatamente o defeito
// que este módulo existe para não repetir. Há um teste que prende essa igualdade.
//
// POR QUE ESM, E NÃO COMMONJS
// Este arquivo atravessa três pipelines: `require` no processo principal, Vitest/Rollup no teste e no
// build, e o dev server do Vite no `npm run desktop`. O dev server não converte CommonJS de fora do
// node_modules: servia `module.exports = {…}` a um import ESM nomeado, e o renderer quebrava ao
// carregar ("does not provide an export named DEFAULT_FOCUS_SETTINGS") com testes, tsc e build
// verdes. Em ESM os três leem o mesmo arquivo — e o Node do Electron faz `require()` de `.mjs`.
//
// FORA DE ESCOPO, DE PROPÓSITO
// O app original tinha nove elementos de Foco. Três ficaram de fora: comportamento quando ausente,
// timeout de tela e loop visual. Os três pertencem ao dispositivo físico Taby e ao host visual — este
// app não tem sensor de presença, não controla a tela e não tem painel para repetir animação. Listar
// controles sem hardware que os honre é precisamente como "09:00–17:00" virou decoração no original.

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// Durações oferecidas na tela de Ajustes. 25 continua sendo o padrão: atualizar o app não pode mudar
// o hábito de ninguém.
export const SESSION_LENGTHS = [15, 25, 50];

// Presets nomeados em vez de um campo de intervalo cru. Cada um é o intervalo mínimo, em minutos,
// entre dois alertas NÃO importantes. Os 30 e 40 minutos do original foram apontados pela própria
// auditoria como excesso de opção sem significado; aqui são três intenções legíveis.
export const NUDGE_PRESETS = { calm: 90, work: 45, wellbeing: 15 };

export const DEFAULT_FOCUS_SETTINGS = Object.freeze({
  sessionMinutes: 25,
  activeStart: '09:00',
  activeEnd: '17:00',
  nudgePreset: 'work',
});

// Hora de parede local, como todo o resto do app (ver domain/wall-clock e domain/date-context):
// 09:00 é 09:00 onde a pessoa estiver. Nada aqui passa por toISOString(), que devolveria o dia UTC e
// escorregaria um dia inteiro fora de UTC-03.
function minutesOfDay(time) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

// Monta um instante a partir dos COMPONENTES locais do dia de `date`, o que atravessa horário de
// verão corretamente: somar 24h em milissegundos não atravessaria.
function localInstant(date, totalMinutes) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0).getTime();
}

function dayAfter(date) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + 1);
  return next;
}

function isTime(value) {
  return typeof value === 'string' && TIME_PATTERN.test(value);
}

/**
 * Sempre devolve um objeto completo e válido, campo a campo. Um ajuste corrompido cai no padrão em
 * vez de derrubar o agendamento: o pior resultado possível aqui seria um app que para de lembrar.
 */
export function sanitizeFocusSettings(value) {
  const input = value && typeof value === 'object' ? value : {};
  const sessionMinutes = SESSION_LENGTHS.includes(input.sessionMinutes) ? input.sessionMinutes : DEFAULT_FOCUS_SETTINGS.sessionMinutes;
  const nudgePreset = Object.prototype.hasOwnProperty.call(NUDGE_PRESETS, input.nudgePreset) ? input.nudgePreset : DEFAULT_FOCUS_SETTINGS.nudgePreset;
  const activeStart = isTime(input.activeStart) ? input.activeStart : DEFAULT_FOCUS_SETTINGS.activeStart;
  const activeEnd = isTime(input.activeEnd) ? input.activeEnd : DEFAULT_FOCUS_SETTINGS.activeEnd;
  // Uma janela invertida ou vazia silenciaria o dia inteiro, para sempre. Isso é pior do que ignorar
  // o ajuste, então os dois campos voltam juntos ao padrão.
  const ordered = minutesOfDay(activeStart) < minutesOfDay(activeEnd);
  return {
    sessionMinutes,
    activeStart: ordered ? activeStart : DEFAULT_FOCUS_SETTINGS.activeStart,
    activeEnd: ordered ? activeEnd : DEFAULT_FOCUS_SETTINGS.activeEnd,
    nudgePreset,
  };
}

/** O fim da sessão de foco em andamento, ou null. Valores estranhos viram null: sem foco, sem portão. */
export function sanitizeFocusUntil(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * O portão só silencia o que está EXPLICITAMENTE marcado como bem-estar. Prazos e lembretes
 * importantes atravessam — é exatamente o que a tela de Foco promete, e a única isenção que promete.
 *
 * Uma entrada sem categoria também atravessa, de propósito: `buildNotificationEntries` sempre carimba
 * a categoria, então isso só alcança dado antigo ou de outra origem. Diante da dúvida o portão
 * prefere avisar demais a engolir um lembrete — um alerta a mais incomoda, um a menos perde o
 * compromisso.
 */
export function isExempt(entry) {
  return entry.category !== 'wellbeing';
}

/** O primeiro instante >= `ms` que cai dentro do horário ativo. */
export function withinActiveHours(ms, settings) {
  const start = minutesOfDay(settings.activeStart);
  const end = minutesOfDay(settings.activeEnd);
  const date = new Date(ms);
  const openToday = localInstant(date, start);
  if (ms < openToday) return openToday;
  if (ms < localInstant(date, end)) return ms;
  return localInstant(dayAfter(date), start);
}

/**
 * O PORTÃO. Dado o instante em que a entrada venceria, devolve o instante em que ela realmente sai.
 * Puro: mesma entrada, mesma saída, sem relógio nem timers por perto — é o que permite que o
 * agendador e a prévia façam a mesma pergunta e recebam a mesma resposta.
 */
export function nextDelivery(entry, occurrenceMs, context) {
  if (isExempt(entry)) return occurrenceMs;
  const settings = context.settings;
  // 1. Horário ativo. Passa pelo mesmo portão que o foco de propósito: o defeito do original nasceu
  //    de o horário ativo ser decidido num lugar e o disparo em outro.
  let at = withinActiveHours(occurrenceMs, settings);
  // 2. Sessão de foco em andamento: o alerta espera o fim dela, e então o próximo horário ativo.
  const until = context.focusUntilMs;
  if (typeof until === 'number' && at < until) at = Math.max(at, withinActiveHours(until, settings));
  // 3. Intensidade do preset: nunca dois nudges colados. Só empurra para frente — um preset largo não
  //    pode puxar um alerta para antes da hora em que ele venceu.
  const last = context.lastNudgeAtMs;
  if (typeof last === 'number' && at - last < NUDGE_PRESETS[settings.nudgePreset] * 60_000) {
    at = Math.max(at, withinActiveHours(last + NUDGE_PRESETS[settings.nudgePreset] * 60_000, settings));
  }
  return at;
}

// Teto por entrada ao varrer um dia, para uma recorrência malformada nunca virar laço infinito.
const MAX_OCCURRENCES_PER_ENTRY = 200;

/**
 * A PRÉVIA: quantos alertas este conjunto de ajustes produz no dia de `dayStartMs`.
 *
 * Não estima — percorre as ocorrências reais do dia e pergunta a `nextDelivery`, entrada por entrada,
 * exatamente como o agendador pergunta. `nextOccurrence` entra por parâmetro para manter este módulo
 * sem dependências (notifications.cjs já depende dele; o contrário fecharia um ciclo).
 */
export function countDailyAlerts({ entries, settings, dayStartMs, nextOccurrence, focusUntilMs = null }) {
  const dayEndMs = localInstant(dayAfter(new Date(dayStartMs)), 0);
  const occurrences = [];
  for (const entry of entries) {
    let cursor = dayStartMs - 1;
    for (let index = 0; index < MAX_OCCURRENCES_PER_ENTRY; index += 1) {
      const next = nextOccurrence(entry, cursor);
      if (next === null || next >= dayEndMs) break;
      occurrences.push({ entry, at: next });
      cursor = next;
    }
  }
  // Em ordem de vencimento: o preset é um intervalo entre alertas, então a contagem precisa ver os
  // alertas na ordem em que a pessoa os receberia.
  occurrences.sort((left, right) => left.at - right.at);
  let lastNudgeAtMs = null;
  let count = 0;
  for (const item of occurrences) {
    const at = nextDelivery(item.entry, item.at, { settings, focusUntilMs, lastNudgeAtMs });
    // Empurrado para fora do dia: conta no dia em que sair, não neste.
    if (at >= dayEndMs) continue;
    count += 1;
    if (!isExempt(item.entry)) lastNudgeAtMs = at;
  }
  return count;
}

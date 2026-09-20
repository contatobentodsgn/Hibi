import { normalizePortuguese } from './ptbr-normalizer';

/**
 * Comandos como a ditação do macOS os escreve.
 *
 * Os comandos do Taby eram reconhecidos por frases exatas — "crie um lembrete X às 15:00" —, mas a
 * ditação escreve do jeito dela: "Crie um lembrete tomar água às 15h.", com maiúscula, ponto final,
 * "15h" em vez de "15:00" e, muitas vezes, o nome do assistente na frente ("Taby, crie…", que a
 * ditação ainda transcreve como "Bibi" ou "Hebe"). Com isso, "às 15h" criava o lembrete para agora,
 * com "às 15h" no título, e "Taby, crie uma tarefa" listava as tarefas em vez de criar.
 */

const COMMAND_VERBS = 'adi[ae]r?|adie|mov[ae]r?|mova|mud[ae]r?|remarc[ae]r?|remarque|deix[ae]r?|conclu[ai]r?|fiz|terminei|acabei|cancel[ae]r?|cancele|tir[ae]r?|tire|marque|marcar|agende|agendar|reserve|reservar|crie|criar|adicione|adicionar|edite|editar|renomeie|renomear|exclua|excluir|apague|apagar|remova|remover|envie|enviar|poste|postar|publique|publicar|inicie|inicia|iniciar|comece|começa|comeca|começar|comecar|me\\s+lembr[ae]r?|lembr[ae]-me|lembre|lembrar';
// O jeito falado de pedir um lembrete — "me lembra de ligar às 15h" — vira o comando que o Taby já
// entende. Sem isso a frase ia para a conversa, e o cérebro offline respondia "claro, vou lembrar"
// sem criar lembrete nenhum.
const SPOKEN_REMINDER = /^(?:me\s+lembr(?:a|e|ar)|lembr(?:a|e)-me|lembre\s+me|lembrar(?:-me)?)\s+(?:de\s+|que\s+|para\s+)?(.+)$/iu;

/**
 * Tira o que a fala acrescenta e o comando não usa: o chamamento no começo ("Taby,", "ei Taby",
 * "Hebe", "por favor") e a pontuação que a ditação põe no fim. O chamamento só sai quando o que vem
 * depois é um verbo de comando — "Hibi Study é um app" continua intacto.
 */
export function normalizeSpokenCommand(message: string): string {
  let text = normalizePortuguese(message.trim().replace(/[.!?…]+$/u, '').trim());
  const vocative = new RegExp(`^(?:(?:ei|oi|olá|ola|hey)[,\\s]+)?(?:(?!me\\s)[\\p{L}]+[,:]?\\s+)?(?:por\\s+favor[,\\s]+)?(?=(?:${COMMAND_VERBS})\\b)`, 'iu');
  text = text.replace(vocative, '').replace(/^(?:por\s+favor[,\s]+)/iu, '');
  const reminder = text.match(SPOKEN_REMINDER);
  return reminder ? `crie um lembrete ${reminder[1]}` : text;
}

const NUMBER_WORDS: Record<string, number> = {
  uma: 1, um: 1, duas: 2, dois: 2, 'três': 3, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7,
  oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
};

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * Um horário dito, em `HH:MM`, ou `null` quando não dá para ter certeza. Aceita o que a ditação
 * costuma escrever: "15:00", "15h", "15h30", "15 horas", "3 da tarde", "três e meia da tarde",
 * "meio-dia" e "meia-noite". Sem período, de 1 a 6 é à tarde ("às 4" é 16:00). Na dúvida, devolve `null`: criar um lembrete para a hora errada é pior
 * do que perguntar.
 */
export function parseSpokenTime(input: string): string | null {
  let text = input.trim().toLocaleLowerCase('pt-BR').replace(/[.!?…]+$/u, '').trim()
    .replace(/^(?:às|as|à|a|ao|para\s+as|para\s+às|pras|pro)\s+/u, '').trim();
  // O período do dia vem por último e vale para qualquer forma da hora: "9h00 da manhã",
  // "9:30 da noite", "nove e meia da manhã". Antes só "9 da manhã" era entendido.
  const periodMatch = text.match(/\s*(?:da|de)\s+(manhã|manha|tarde|noite|madrugada)$/u);
  const period = periodMatch?.[1] ?? null;
  if (periodMatch) text = text.slice(0, periodMatch.index).trim();

  if (!period && /^meio[-\s]?dia$/u.test(text)) return '12:00';
  if (!period && /^meio[-\s]?dia\s+e\s+meia$/u.test(text)) return '12:30';
  if (!period && /^meia[-\s]?noite$/u.test(text)) return '00:00';
  if (!period && /^meia[-\s]?noite\s+e\s+meia$/u.test(text)) return '00:30';

  let hour: number | undefined;
  let minutes = 0;
  const clock = text.match(/^(\d{1,2}):(\d{2})$/u);
  const hours = text.match(/^(\d{1,2})\s*(?:h|hs|horas?)?(?:\s*(?:e\s*)?(\d{1,2})(?:\s*(?:min|minutos?))?)?$/u);
  const words = text.match(/^([\p{L}]+)(?:\s+horas?)?(?:\s+e\s+(meia|quinze|(\d{1,2})))?$/u);
  if (clock) { hour = Number(clock[1]); minutes = Number(clock[2]); }
  else if (hours) { hour = Number(hours[1]); minutes = hours[2] ? Number(hours[2]) : 0; }
  else if (words && NUMBER_WORDS[words[1]!] !== undefined) {
    hour = NUMBER_WORDS[words[1]!];
    minutes = words[2] === 'meia' ? 30 : words[2] === 'quinze' ? 15 : words[3] ? Number(words[3]) : 0;
  }
  else return null;
  if (hour === undefined) return null;
  // Sem período, de 1 a 6 é à tarde: ninguém marca reunião às 4 da madrugada, e "adia para as quatro e
  // meia" virava 04:30. Quem quer a madrugada diz "da madrugada" ou escreve com zero, "04:30".
  if (!period) return valid(hour >= 1 && hour <= 6 && !/^0\d/u.test(text) ? hour + 12 : hour, minutes);
  // Com período, a hora é a do relógio de 12 horas: "13 da tarde" não existe.
  if (hour < 1 || hour > 12) return null;
  // "12 da tarde" é meio-dia; "12 da noite" e "12 da madrugada" são meia-noite.
  if (hour === 12) return valid(period === 'tarde' ? 12 : 0, minutes);
  return valid(period === 'tarde' || period === 'noite' ? hour + 12 : hour, minutes);
}

function valid(hour: number, minutes: number): string | null {
  if (!Number.isInteger(hour) || !Number.isInteger(minutes) || hour < 0 || hour > 23 || minutes < 0 || minutes > 59) return null;
  return `${pad(hour)}:${pad(minutes)}`;
}

const DAY_WORDS: ReadonlyArray<readonly [RegExp, number]> = [
  [/(?:^|\s)(?:para\s+|pra\s+)?depois\s+de\s+amanh[ãa](?=\s|$)/iu, 2],
  [/(?:^|\s)(?:para\s+|pra\s+|de\s+)?amanh[ãa](?=\s|$)/iu, 1],
  [/(?:^|\s)(?:para\s+|pra\s+|de\s+)?hoje(?=\s|$)/iu, 0],
];
const WEEKDAYS: Record<string, number> = { domingo: 0, segunda: 1, terça: 2, terca: 2, quarta: 3, quinta: 4, sexta: 5, sábado: 6, sabado: 6 };
const WEEKDAY = /(?:^|\s)(?:n[ao]\s+|para\s+|pra\s+)?(?:(?:próxim[ao]|proxim[ao])\s+)?(domingo|segunda|terça|terca|quarta|quinta|sexta|sábado|sabado)(?:-feira)?(?=\s|$)/iu;
const DAY_OF_MONTH = /(?:^|\s)(?:n[ao]\s+|para\s+o\s+|pro\s+)?dia\s+(\d{1,2})(?:\s+de\s+([\p{L}]+))?(?=\s|$)|(?:^|\s)(\d{1,2})\/(\d{1,2})(?=\s|$)/iu;
const MONTHS: Record<string, number> = { janeiro: 1, fevereiro: 2, março: 3, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };

const dayKeyOf = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;
const daysBetween = (fromKey: string, toKey: string) => Math.round((Date.UTC(+toKey.slice(0, 4), +toKey.slice(5, 7) - 1, +toKey.slice(8, 10)) - Date.UTC(+fromKey.slice(0, 4), +fromKey.slice(5, 7) - 1, +fromKey.slice(8, 10))) / 86_400_000);

/**
 * O dia dito, em dias a partir de `today` (`AAAA-MM-DD`), e o texto sem ele: "hoje", "amanhã",
 * "depois de amanhã", um dia da semana (o próximo, nunca o de hoje: "sexta" dito numa sexta é a da
 * semana que vem), "dia 25" (deste mês, ou do próximo se já passou) e "25/09".
 */
export function takeSpokenDay(text: string, today?: string): { days: number | null; rest: string } {
  const cut = (pattern: RegExp) => text.replace(pattern, ' ').replace(/\s+/gu, ' ').trim();
  for (const [pattern, days] of DAY_WORDS) if (pattern.test(text)) return { days, rest: cut(pattern) };
  if (!today) return { days: null, rest: text.trim() };
  const weekday = text.match(WEEKDAY);
  if (weekday) {
    const current = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10))).getUTCDay();
    const ahead = (WEEKDAYS[weekday[1]!.toLocaleLowerCase('pt-BR')]! - current + 7) % 7 || 7;
    return { days: ahead, rest: cut(WEEKDAY) };
  }
  const date = text.match(DAY_OF_MONTH);
  if (date) {
    const year = +today.slice(0, 4); const month = +today.slice(5, 7); const todayDay = +today.slice(8, 10);
    const day = Number(date[1] ?? date[3]);
    const namedMonth = date[2] ? MONTHS[date[2].toLocaleLowerCase('pt-BR')] : undefined;
    if (date[2] && !namedMonth) return { days: null, rest: text.trim() };
    const wantedMonth = date[4] ? Number(date[4]) : namedMonth ?? (day >= todayDay ? month : month + 1);
    const wantedYear = wantedMonth > 12 ? year + 1 : year;
    const normalizedMonth = ((wantedMonth - 1) % 12) + 1;
    let key = dayKeyOf(wantedYear, normalizedMonth, day);
    const check = new Date(Date.UTC(wantedYear, normalizedMonth - 1, day));
    if (check.getUTCDate() !== day || normalizedMonth < 1) return { days: null, rest: text.trim() };
    if (daysBetween(today, key) < 0) key = dayKeyOf(wantedYear + 1, normalizedMonth, day);
    return { days: daysBetween(today, key), rest: cut(DAY_OF_MONTH) };
  }
  return { days: null, rest: text.trim() };
}

const SCHEDULE = /^(?:marque|marcar|agende|agendar|reserve|reservar|crie|criar|adicione|adicionar)\s+(?:uma?\s+)?(reunião|reuniao|compromisso|evento|bloco|horário|horario)\b(.*)$/iu;
// Um horário começa com número, "meio"/"meia" ou número por extenso: sem isso o "a" de "com a Ana"
// era lido como o "a" de "às 15h".
const TIME_START = '(?=\\d|meio|meia|uma\\b|duas|tr[êe]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)';
const RANGE = new RegExp(`\\s*(?:d[ae]s?|entre)\\s+${TIME_START}(.+?)\\s+(?:às|as|a|até|ate|e)\\s+${TIME_START}(.+?)\\s*$`, 'iu');
const AT = new RegExp(`(?:^|\\s+)(?:às|as|à|a|ao|para\\s+as|para\\s+às|pras|pro)\\s+${TIME_START}(.+?)\\s*$`, 'iu');

export type ScheduleRequest =
  | Readonly<{ kind: 'block'; title: string; days: number; start: string; end: string; meeting: boolean }>
  | Readonly<{ kind: 'unclear'; said: string }>;

const plusMinutes = (time: string, minutes: number): string => {
  const total = Math.min(23 * 60 + 59, Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) + minutes);
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
};

/**
 * "Marque uma reunião com a Ana amanhã às 15h", "agende um compromisso hoje das 14h às 16h": um bloco
 * na agenda. Antes esses pedidos não eram reconhecidos e iam para o cérebro offline, que respondia
 * "marquei" sem marcar nada. Sem horário final, a reunião dura uma hora.
 */
export function parseScheduleRequest(message: string, today?: string): ScheduleRequest | null {
  const found = message.match(SCHEDULE);
  if (!found) return null;
  const noun = found[1]!.toLocaleLowerCase('pt-BR');
  const { days, rest: withoutDay } = takeSpokenDay(found[2]!.replace(/\s+(?:para|pra)\s+mim\b/iu, ' '), today);
  let rest = withoutDay;
  let start: string | null = null;
  let end: string | null = null;
  const range = rest.match(RANGE);
  const at = range ? null : rest.match(AT);
  if (range) {
    start = parseSpokenTime(range[1]!); end = parseSpokenTime(range[2]!);
    if (!start || !end) return { kind: 'unclear', said: !start ? range[1]! : range[2]! };
    rest = rest.slice(0, range.index);
  } else if (at) {
    start = parseSpokenTime(at[1]!);
    if (!start) return { kind: 'unclear', said: at[1]! };
    end = plusMinutes(start, 60);
    rest = rest.slice(0, at.index);
  } else return { kind: 'unclear', said: '' };
  const detail = rest.replace(/^[\s:–-]+/u, '').trim();
  const label = noun === 'bloco' || noun.startsWith('hor') ? detail || 'Bloco' : `${noun === 'reuniao' ? 'Reunião' : noun[0]!.toLocaleUpperCase('pt-BR') + noun.slice(1)}${detail ? ` ${detail}` : ''}`;
  // Reunião, compromisso e evento são reuniões (agenda, tarefas e calendário); bloco e horário, só agenda.
  return { kind: 'block', title: label, days: days ?? 0, start, end, meeting: !(noun === 'bloco' || noun.startsWith('hor')) };
}

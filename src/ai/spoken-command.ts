/**
 * Comandos como a ditação do macOS os escreve.
 *
 * Os comandos do Taby eram reconhecidos por frases exatas — "crie um lembrete X às 15:00" —, mas a
 * ditação escreve do jeito dela: "Crie um lembrete tomar água às 15h.", com maiúscula, ponto final,
 * "15h" em vez de "15:00" e, muitas vezes, o nome do assistente na frente ("Taby, crie…", que a
 * ditação ainda transcreve como "Bibi" ou "Hebe"). Com isso, "às 15h" criava o lembrete para agora,
 * com "às 15h" no título, e "Taby, crie uma tarefa" listava as tarefas em vez de criar.
 */

const COMMAND_VERBS = 'marque|marcar|agende|agendar|reserve|reservar|crie|criar|adicione|adicionar|edite|editar|renomeie|renomear|exclua|excluir|apague|apagar|remova|remover|envie|enviar|poste|postar|publique|publicar|inicie|inicia|iniciar|comece|começa|comeca|começar|comecar|me\\s+lembr[ae]r?|lembr[ae]-me|lembre|lembrar';
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
  let text = message.trim().replace(/[.!?…]+$/u, '').trim();
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
 * "meio-dia" e "meia-noite". Na dúvida, devolve `null`: criar um lembrete para a hora errada é pior
 * do que perguntar.
 */
export function parseSpokenTime(input: string): string | null {
  const text = input.trim().toLocaleLowerCase('pt-BR').replace(/[.!?…]+$/u, '').trim();
  if (/^meio[-\s]?dia$/u.test(text)) return '12:00';
  if (/^meio[-\s]?dia\s+e\s+meia$/u.test(text)) return '12:30';
  if (/^meia[-\s]?noite$/u.test(text)) return '00:00';
  if (/^meia[-\s]?noite\s+e\s+meia$/u.test(text)) return '00:30';

  const clock = text.match(/^(\d{1,2}):(\d{2})$/u);
  if (clock) return valid(Number(clock[1]), Number(clock[2]));

  const hours = text.match(/^(\d{1,2})\s*(?:h|hs|horas?)(?:\s*(?:e\s*)?(\d{1,2})(?:\s*(?:min|minutos?))?)?$/u);
  if (hours) return valid(Number(hours[1]), hours[2] ? Number(hours[2]) : 0);

  const period = text.match(/^(\d{1,2}|[\p{L}]+)(?:\s*(?:h|horas?))?(?:\s+e\s+(meia|quinze|(\d{1,2})))?\s+da\s+(manhã|manha|tarde|noite|madrugada)$/u);
  if (period) {
    const base = /^\d+$/u.test(period[1]!) ? Number(period[1]) : NUMBER_WORDS[period[1]!];
    if (base === undefined || base < 1 || base > 12) return null;
    const minutes = period[2] === 'meia' ? 30 : period[2] === 'quinze' ? 15 : period[3] ? Number(period[3]) : 0;
    const part = period[4]!;
    const hour = part === 'tarde' || part === 'noite' ? (base === 12 ? 12 : base + 12) : part.startsWith('madrug') || part.startsWith('manh') ? (base === 12 ? 0 : base) : base;
    return valid(hour, minutes);
  }
  return null;
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

/** O dia dito ("hoje", "amanhã", "depois de amanhã"), em dias a partir de hoje, e o texto sem ele. */
export function takeSpokenDay(text: string): { days: number | null; rest: string } {
  for (const [pattern, days] of DAY_WORDS) {
    if (pattern.test(text)) return { days, rest: text.replace(pattern, ' ').replace(/\s+/gu, ' ').trim() };
  }
  return { days: null, rest: text.trim() };
}

const SCHEDULE = /^(?:marque|marcar|agende|agendar|reserve|reservar|crie|criar|adicione|adicionar)\s+(?:uma?\s+)?(reunião|reuniao|compromisso|evento|bloco|horário|horario)\b(.*)$/iu;
// Um horário começa com número, "meio"/"meia" ou número por extenso: sem isso o "a" de "com a Ana"
// era lido como o "a" de "às 15h".
const TIME_START = '(?=\\d|meio|meia|uma\\b|duas|tr[êe]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)';
const RANGE = new RegExp(`\\s*(?:d[ae]s?|entre)\\s+${TIME_START}(.+?)\\s+(?:às|as|a|até|ate|e)\\s+${TIME_START}(.+?)\\s*$`, 'iu');
const AT = new RegExp(`(?:^|\\s+)(?:às|as|à|a|para\\s+as|para\\s+às|pras)\\s+${TIME_START}(.+?)\\s*$`, 'iu');

export type ScheduleRequest =
  | Readonly<{ kind: 'block'; title: string; days: number; start: string; end: string }>
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
export function parseScheduleRequest(message: string): ScheduleRequest | null {
  const found = message.match(SCHEDULE);
  if (!found) return null;
  const noun = found[1]!.toLocaleLowerCase('pt-BR');
  const { days, rest: withoutDay } = takeSpokenDay(found[2]!.replace(/\s+(?:para|pra)\s+mim\b/iu, ' '));
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
  return { kind: 'block', title: label, days: days ?? 0, start, end };
}

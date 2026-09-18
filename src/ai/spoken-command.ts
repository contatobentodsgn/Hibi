/**
 * Comandos como a ditação do macOS os escreve.
 *
 * Os comandos do Taby eram reconhecidos por frases exatas — "crie um lembrete X às 15:00" —, mas a
 * ditação escreve do jeito dela: "Crie um lembrete tomar água às 15h.", com maiúscula, ponto final,
 * "15h" em vez de "15:00" e, muitas vezes, o nome do assistente na frente ("Taby, crie…", que a
 * ditação ainda transcreve como "Bibi" ou "Hebe"). Com isso, "às 15h" criava o lembrete para agora,
 * com "às 15h" no título, e "Taby, crie uma tarefa" listava as tarefas em vez de criar.
 */

const COMMAND_VERBS = 'crie|criar|adicione|adicionar|edite|editar|renomeie|renomear|exclua|excluir|apague|apagar|remova|remover|envie|enviar|poste|postar|publique|publicar|inicie|inicia|iniciar|comece|começa|comeca|começar|comecar|me\\s+lembr[ae]r?|lembr[ae]-me|lembre|lembrar';
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

import type { LocalRepository } from '../data/local-repository';
import { findConflicts } from '../domain/conflicts';
import { shiftDayKey } from '../domain/date-context';
import type { AiProviderProposal, AiToolCall } from './contracts';
import { parseSpokenTime, takeSpokenDay } from './spoken-command';
import { soundKey } from './voice-vocabulary';

/**
 * Pedidos sobre o que já existe: mover ou adiar, concluir e apagar. "Adia minha reunião com a Cristiane
 * para as 16h", "já fiz a academia", "apaga o lembrete do banco", "deixa isso pra amanhã".
 *
 * O código acha a coisa pelo nome, calcula o novo horário e monta a proposta; a pessoa confirma antes de
 * qualquer escrita. Quando o nome bate com mais de uma coisa, ou com nenhuma, o Assistant pergunta em vez de
 * escolher sozinho.
 */

export type EntityKind = 'block' | 'task' | 'reminder' | 'habit' | 'note';
export type EntityCommand = Readonly<{ action: 'move' | 'complete' | 'delete'; target: string; when: string }>;
/** O assunto da conversa: o que foi criado ou mexido por último, para "isso" e "deixa pra amanhã". */
export type Subject = Readonly<{ kind: EntityKind; id?: string; title: string }>;

const MOVE_VERB = 'mov[ae]r?|mova|mud[ae]r?|passa|passe|passar|adi[ae]r?|adie|remarc[ae]r?|remarque|transfir[ae]|transfer[ae]r?|jog[ae]r?|empurr[ae]r?|deix[ae]r?|troc[ae]r?';
const MOVE = new RegExp(`^(?:${MOVE_VERB})(?=\\s|$)\\s*(.*?)\\s*(?:(?:^|\\s)(?:para|pra|pro)\\s+(.+))?$`, 'iu');
const COMPLETE = [
  /^(?:j[áa]\s+)?(?:fiz|terminei|conclu[íi]|acabei(?:\s+de\s+fazer)?|finalizei|completei)\s+(.+)$/iu,
  /^(?:marc[ae]r?|marque|coloc[ae])\s+(.+?)\s+como\s+(?:feit[ao]s?|conclu[íi]d[ao]s?|pront[ao]s?|finalizad[ao]s?)$/iu,
  /^conclu[ai]r?\s+(.+)$/iu,
];
const DELETE = /^(?:apag[ae]r?|apague|exclu[ai]r?|exclua|remov[ae]r?|remova|cancel[ae]r?|cancele|tir[ae]r?|tire|delet[ae]r?|delete)\s+(.+)$/iu;
// "Crie uma reunião", "tira uma dúvida": com artigo indefinido é coisa nova, não uma que já existe.
const INDEFINITE = /^(?:um|uma|uns|umas)\s/iu;
const PRONOUN = /^(?:isso|isto|aquilo|ela|ele|essa|esse|esta|este|a\s+mesma|o\s+mesmo)?$/iu;
const KIND_WORDS: ReadonlyArray<readonly [RegExp, EntityKind]> = [
  [/^(?:reuni[ãa]o|reuni[õo]es|compromisso|evento|bloco|agenda)$/iu, 'block'],
  [/^(?:tarefa|tarefas|demanda)$/iu, 'task'],
  [/^(?:lembrete|lembretes)$/iu, 'reminder'],
  [/^(?:h[áa]bito|h[áa]bitos)$/iu, 'habit'],
  [/^(?:nota|notas|anota[çc][ãa]o)$/iu, 'note'],
];
const STOPWORDS = new Set(['a', 'o', 'as', 'os', 'da', 'do', 'das', 'dos', 'de', 'e', 'com', 'minha', 'meu', 'minhas', 'meus', 'sua', 'seu', 'para', 'pra', 'pro', 'no', 'na', 'nos', 'nas', 'em', 'que', 'aquela', 'aquele', 'hoje', 'pode', 'por', 'favor']);

const clean = (text: string) => text.replace(/[,;].*$/u, '').replace(/\s+(?:de\s+)?hoje$/iu, '').replace(/[.!?…]+$/u, '').trim();

/** Um pedido sobre algo que já existe, ou `null` quando a frase é outra coisa. */
export function parseEntityCommand(message: string): EntityCommand | null {
  const text = message.trim();
  for (const pattern of COMPLETE) {
    const found = text.match(pattern);
    if (found && !INDEFINITE.test(found[1]!)) return { action: 'complete', target: clean(found[1]!), when: '' };
  }
  const removal = text.match(DELETE);
  if (removal && !INDEFINITE.test(removal[1]!) && !/^(?:tod[ao]s?|tudo)\b/iu.test(removal[1]!)) return { action: 'delete', target: clean(removal[1]!), when: '' };
  const move = text.match(MOVE);
  if (move) {
    const target = move[1]!.trim();
    const when = (move[2] ?? '').trim();
    if (INDEFINITE.test(target)) return null;
    // "deixa" e "troca" só são pedido de mudar de horário com o destino dito: "deixa eu ver" não é.
    if (!when && /^(?:deix|troc|jog|passa)/iu.test(text)) return null;
    return { action: 'move', target: clean(target), when };
  }
  return null;
}

export type Found = Readonly<{ kind: EntityKind; id: string; title: string; start?: string; end?: string; deadline?: string; at?: string; isHard?: boolean }>;

const words = (text: string) => text.toLocaleLowerCase('pt-BR').match(/[\p{L}\p{N}]+/gu) ?? [];
const sameWord = (spoken: string, written: string) => {
  const a = soundKey(spoken); const b = soundKey(written);
  return a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)));
};

/** Tudo o que pode ser o alvo, com os tipos que o pedido admite. */
function candidates(repository: LocalRepository, action: EntityCommand['action'], today: string): Found[] {
  const blocks = repository.listBlocks().filter((block) => block.end.slice(0, 10) >= today).map((block) => ({ kind: 'block' as const, id: block.id, title: block.title, start: block.start, end: block.end, ...(block.isHard ? { isHard: true } : {}) }));
  const tasks = repository.listTasks().filter((task) => task.status !== 'completed').map((task) => ({ kind: 'task' as const, id: task.id, title: task.title, ...(task.deadline ? { deadline: task.deadline } : {}) }));
  const reminders = repository.listReminders().filter((reminder) => reminder.status !== 'completed').map((reminder) => ({ kind: 'reminder' as const, id: reminder.id, title: reminder.title, at: reminder.schedule.at }));
  const habits = repository.listHabits().filter((habit) => habit.status !== 'paused' && habit.status !== 'completed').map((habit) => ({ kind: 'habit' as const, id: habit.id, title: habit.title }));
  const notes = repository.listNotes().map((note) => ({ kind: 'note' as const, id: note.id, title: note.title }));
  if (action === 'move') return [...blocks, ...tasks, ...reminders];
  if (action === 'complete') return [...tasks, ...habits, ...reminders];
  return [...blocks, ...tasks, ...reminders, ...notes];
}

const isToday = (item: Found, today: string) => [item.start, item.deadline, item.at].some((value) => value?.slice(0, 10) === today);

/**
 * As coisas cujo nome bate com o que foi dito. Todas as palavras que importam precisam bater, ou quase
 * todas: "a produção do post da Kabrito" acha "Kabrito Post 01". Com empate, vence o que é de hoje.
 */
export function findEntities(repository: LocalRepository, action: EntityCommand['action'], reference: string, today: string): Found[] {
  const spoken = words(reference).filter((word) => !STOPWORDS.has(word));
  const kinds = new Set(spoken.flatMap((word) => KIND_WORDS.filter(([pattern]) => pattern.test(word)).map(([, kind]) => kind)));
  const content = spoken.filter((word) => !KIND_WORDS.some(([pattern]) => pattern.test(word)));
  const required = content.length ? content : spoken;
  if (!required.length) return [];
  const pool = candidates(repository, action, today).filter((item) => !kinds.size || kinds.has(item.kind));
  const scored = pool.map((item) => {
    const title = words(item.title);
    const matched = required.filter((word) => title.some((written) => sameWord(word, written))).length;
    return { item, score: matched / required.length, matched };
  }).filter(({ score, matched }) => matched > 0 && score >= 0.5);
  if (!scored.length) return [];
  const best = Math.max(...scored.map(({ score }) => score));
  const top = scored.filter(({ score }) => score === best).map(({ item }) => item);
  const fromToday = top.filter((item) => isToday(item, today));
  return fromToday.length === 1 ? fromToday : top;
}

/** O assunto da conversa, se ainda existe. */
function fromSubject(repository: LocalRepository, subject: Subject | null, action: EntityCommand['action'], today: string): Found | null {
  if (!subject) return null;
  const pool = candidates(repository, action, today).filter((item) => item.kind === subject.kind);
  return pool.find((item) => item.id === subject.id) ?? [...pool].reverse().find((item) => item.title.toLocaleLowerCase('pt-BR') === subject.title.toLocaleLowerCase('pt-BR')) ?? null;
}

const dayMonth = (value: string) => `${value.slice(8, 10)}/${value.slice(5, 7)}`;
const hourOf = (value: string) => value.slice(11, 16);
const minutesBetween = (start: string, end: string) => Math.round((Date.parse(end) - Date.parse(start)) / 60_000);
const addMinutes = (value: string, minutes: number) => {
  const [date, time] = [value.slice(0, 10), value.slice(11, 16)];
  const total = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) + minutes;
  const days = Math.floor(total / 1440);
  const rest = ((total % 1440) + 1440) % 1440;
  return `${shiftDayKey(date, days)}T${String(Math.floor(rest / 60)).padStart(2, '0')}:${String(rest % 60).padStart(2, '0')}:00`;
};
const quoteList = (items: readonly Found[]) => {
  const names = [...new Set(items.map((item) => `"${item.title}"`))].slice(0, 4);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} ou ${names[names.length - 1]}` : names[0]!;
};
const FROM_KIND: Record<EntityKind, string> = { block: 'da agenda', task: 'das tarefas', reminder: 'dos lembretes', habit: 'dos hábitos', note: 'das notas' };

export type EntityProposal = Readonly<{ proposal: AiProviderProposal; subject: Subject | null }>;

const proposalOf = (toolCalls: AiToolCall[], reply: string, clarification = false): AiProviderProposal => ({ reply, toolCalls, notchPresentation: null, providerMetadata: { model: 'local-tool-provider', ...(clarification ? { finishReason: 'needs-clarification' } : {}) } });

/** O novo início: o dia e a hora ditos, e o que não foi dito fica como estava. `null` quando não se entende. */
function newStart(when: string, current: string | undefined, today: string): { value: string } | { unclear: string } {
  const { days, rest } = takeSpokenDay(when, today);
  const timeText = rest.replace(/^(?:o\s+)?(?:mesmo\s+)?hor[áa]rio$/iu, '').trim();
  const time = timeText ? parseSpokenTime(timeText) : null;
  if (timeText && !time) return { unclear: timeText };
  if (days === null && !time) return { unclear: when };
  const day = days === null ? (current?.slice(0, 10) ?? today) : shiftDayKey(today, days);
  const clock = time ?? (current ? hourOf(current) : '09:00');
  return { value: `${day}T${clock}:00` };
}

export function entityProposal(repository: LocalRepository, command: EntityCommand, today: string, subject: Subject | null): EntityProposal {
  const ask = (text: string): EntityProposal => ({ proposal: proposalOf([], text, true), subject });
  const pronoun = PRONOUN.test(command.target);
  const context = pronoun ? fromSubject(repository, subject, command.action, today) : null;
  if (pronoun && !context) return ask('Sobre o que você está falando? Diga o nome, por exemplo "adia a reunião com a Ana para amanhã".');
  const found = context ? [context] : findEntities(repository, command.action, command.target, today);
  if (!found.length) return ask(`Não achei "${command.target}" na agenda, nas tarefas nem nos lembretes.`);
  if (found.length > 1) return ask(`Qual delas: ${quoteList(found)}?`);
  const item = found[0]!;
  const next: Subject = { kind: item.kind, id: item.id, title: item.title };
  const done = (toolCalls: AiToolCall[], reply: string): EntityProposal => ({ proposal: proposalOf(toolCalls, reply), subject: next });

  if (command.action === 'complete') {
    if (item.kind === 'habit') return done([{ name: 'habit.complete', arguments: { id: item.id, date: today } }], `Marcar o hábito "${item.title}" como feito hoje?`);
    if (item.kind === 'reminder') return done([{ name: 'reminder.update', arguments: { id: item.id, status: 'completed' } }], `Marcar o lembrete "${item.title}" como concluído?`);
    return done([{ name: 'task.update', arguments: { id: item.id, status: 'completed' } }], `Marcar a tarefa "${item.title}" como concluída?`);
  }

  if (command.action === 'delete') {
    // Uma reunião marcada pelo Assistant tem uma tarefa gêmea, com prazo no início dela: as duas saem juntas.
    const twin = item.kind === 'block' && item.isHard ? repository.listTasks().find((task) => task.title === item.title && task.deadline === item.start) : undefined;
    const calls: AiToolCall[] = [{ name: `${item.kind}.delete`, arguments: { id: item.id } }, ...(twin ? [{ name: 'task.delete', arguments: { id: twin.id } }] : [])];
    const where = ` ${FROM_KIND[item.kind]}${twin ? ' e das tarefas' : ''}`;
    return done(calls, `Excluir "${item.title}"${where}? Isso não pode ser desfeito.`);
  }

  if (!command.when) return ask(`Para quando? Diga, por exemplo, "para amanhã às 15h".`);
  const current = item.start ?? item.deadline ?? item.at;
  const start = newStart(command.when, current, today);
  if ('unclear' in start) return ask(`Não entendi para quando: "${start.unclear}". Diga, por exemplo, "para amanhã às 15h".`);
  const from = current ? ` de ${dayMonth(current)} ${hourOf(current)}` : '';
  const to = `para ${dayMonth(start.value)} às ${hourOf(start.value)}`;

  if (item.kind === 'block') {
    const end = addMinutes(start.value, minutesBetween(item.start!, item.end!));
    const twin = item.isHard ? repository.listTasks().find((task) => task.title === item.title && task.deadline === item.start) : undefined;
    const clash = findConflicts({ id: item.id, title: item.title, start: start.value, end, category: 'work', ...(item.isHard ? { isHard: true } : {}) }, repository.listBlocks().filter((block) => block.id !== item.id))
      .filter((conflict) => conflict.severity === 'hard')
      .map((conflict) => repository.listBlocks().find((block) => block.id === conflict.existingId)?.title)
      .filter(Boolean);
    const note = clash.length ? ` Atenção: no novo horário já tem o compromisso "${clash.join('" e "')}".` : '';
    return done([
      { name: 'block.update', arguments: { id: item.id, start: start.value, end } },
      ...(twin ? [{ name: 'task.update', arguments: { id: twin.id, deadline: start.value } }] : []),
    ], `Mover "${item.title}"${from} ${to}?${note}`);
  }
  if (item.kind === 'reminder') return done([{ name: 'reminder.update', arguments: { id: item.id, at: start.value } }], `Mover o lembrete "${item.title}"${from} ${to}?`);
  return done([{ name: 'task.update', arguments: { id: item.id, deadline: start.value } }], `Mudar o prazo da tarefa "${item.title}"${from} ${to}?`);
}

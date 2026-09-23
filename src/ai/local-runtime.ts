import { normalizeSpokenCommand, parseScheduleRequest, parseSpokenTime, takeSpokenDay } from './spoken-command';
import { entityProposal, parseEntityCommand, type Subject } from './entity-commands';
import { LocalRepository } from '../data/local-repository';
import { findConflicts, validateScheduleBlock } from '../domain/conflicts';
import { localDateKey, shiftDayKey } from '../domain/date-context';
import { toFloatingWallClock } from '../domain/wall-clock';
import type { Category, ScheduleBlock, Task } from '../domain/models';
import { AiToolPolicy } from './policy';
import type { AiFallbackPolicy, AiProvider, AiProviderProposal, AiProviderRequest, AiToolCall } from './contracts';
import { HeuristicAiProvider } from './heuristic-provider';
import { AiTurnRuntime, type AiRuntimeUsageEvent } from './runtime';
import { ToolRegistry, type HibiTool } from './tools';
import type { AiAuditEvent } from './history';

// Uma ação remota só é registrada como ferramenta quando a ponte do app desktop
// oferece o par preparar/executar. Sem ela o assistente segue estritamente local.
export type IntegrationActionBridge = Readonly<{
  prepare: (input: { connectorId: string; kind: string; payload: Record<string, unknown> }) => Promise<{ id: string; connectorId: string; kind: string; confirmationId: string }>;
  executeApproved: (input: { actionId: string; confirmationId: string }) => Promise<{ ok: boolean; remoteId?: string }>;
}>;
// Publicar uma reunião no calendário conectado. Devolve o nome do calendário, ou `null` quando nenhum
// calendário bidirecional foi escolhido em Ajustes › Integrations.
// `update` leva ao calendário o novo horário de um bloco que já foi publicado nele; devolve o nome do
// calendário, ou `null` quando o bloco não está lá.
export type MeetingCalendarBridge = Readonly<{ publish: (block: ScheduleBlock) => Promise<string | null>; update?: (block: ScheduleBlock) => Promise<string | null> }>;
type Hooks = Readonly<{ calendar?: MeetingCalendarBridge; onDataChanged?: () => void; onTaskStatusChanged?: (before: Task, after: Task) => void; onBlockCreated?: (block: ScheduleBlock) => void; onBlockDeleted?: (block: ScheduleBlock) => void; onFocusStarted?: () => void; onAudit?: (event: AiAuditEvent) => void; onUsage?: (event: AiRuntimeUsageEvent) => void; integrations?: IntegrationActionBridge }>;
const isText = (value: unknown, max = 240): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
// Aceita a hora de parede flutuante que o app grava e, vindo de um provedor externo, também um
// instante com fuso — que `wallClock` normaliza antes de virar dado, para que nada com offset entre
// no workspace pela porta do assistente.
const isIsoDateTime = (value: unknown): value is string => isText(value, 40) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})?$/.test(value);
const wallClock = (value: unknown): string => toFloatingWallClock(String(value));
const category = (value: unknown): value is Category => ['work', 'break', 'learning', 'important', 'wellbeing'].includes(String(value));
const title = (arguments_: Record<string, unknown>) => String(arguments_.title ?? '').trim();
const id = (arguments_: Record<string, unknown>) => isText(arguments_.id, 240) ? arguments_.id : '';
const isConnectorId = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9-]{1,80}$/.test(value);
const entityStatus = (value: unknown) => value === undefined || ['open', 'completed', 'paused'].includes(String(value));

export function createLocalToolRegistry(repository: LocalRepository, hooks: Hooks = {}): ToolRegistry {
  const register = (tool: HibiTool) => registry.register(tool);
  const registry = new ToolRegistry();
  register({ name: 'search.schedule', description: 'Read local schedule blocks.', risk: 'read', inputSchema: { type: 'object' }, validate: () => true, execute: () => ({ summary: `${repository.listBlocks().length} blocos na agenda`, data: { count: repository.listBlocks().length } }) });
  register({ name: 'search.tasks', description: 'Read local tasks.', risk: 'read', inputSchema: { type: 'object' }, validate: () => true, execute: () => ({ summary: `${repository.listTasks().filter((task) => task.status !== 'completed').length} tarefas abertas` }) });
  register({ name: 'search.reminders', description: 'Read local reminders.', risk: 'read', inputSchema: { type: 'object' }, validate: () => true, execute: () => ({ summary: `${repository.listReminders().filter((reminder) => reminder.status !== 'paused').length} lembretes ativos` }) });
  register({ name: 'task.create', description: 'Create a local task.', risk: 'reversible', externallyVisible: true, inputSchema: { type: 'object', required: ['title'] }, validate: (args) => isText(args.title) && (args.durationMinutes === undefined || Number.isInteger(args.durationMinutes) && Number(args.durationMinutes) >= 5 && Number(args.durationMinutes) <= 480), execute: (args) => { const task = repository.createTask({ title: title(args), durationMinutes: Number(args.durationMinutes ?? 60), category: 'work', folder: 'Bento', status: 'open' }); hooks.onDataChanged?.(); return { summary: `Tarefa criada: ${task.title}`, data: { id: task.id } }; } });
  // Só avisa quando o status muda: renomear uma tarefa já concluída não é conclusão nem reabertura.
  // getTask devolve o objeto vivo do repositório, então o "antes" é copiado antes da mutação.
  register({ name: 'task.update', description: 'Update a local task title, duration, deadline, or status.', risk: 'reversible', externallyVisible: true, inputSchema: { type: 'object', required: ['id'] }, validate: (args) => Boolean(id(args)) && (args.title === undefined || isText(args.title)) && (args.durationMinutes === undefined || Number.isInteger(args.durationMinutes) && Number(args.durationMinutes) >= 5 && Number(args.durationMinutes) <= 480) && (args.deadline === undefined || isIsoDateTime(args.deadline)) && entityStatus(args.status), execute: (args) => { const current = repository.getTask(id(args)); const before = current && { ...current }; const task = repository.updateTask(id(args), { ...(args.title === undefined ? {} : { title: title(args) }), ...(args.durationMinutes === undefined ? {} : { durationMinutes: Number(args.durationMinutes) }), ...(args.deadline === undefined ? {} : { deadline: wallClock(args.deadline) }), ...(args.status === undefined ? {} : { status: args.status as 'open' | 'completed' | 'paused' }) }); hooks.onDataChanged?.(); if (before && before.status !== task.status) hooks.onTaskStatusChanged?.(before, task); return { summary: `Tarefa atualizada: ${task.title}`, data: { id: task.id } }; } });
  register({ name: 'task.delete', description: 'Permanently delete a local task.', risk: 'destructive', inputSchema: { type: 'object', required: ['id'] }, validate: (args) => Boolean(id(args)), execute: (args) => { const task = repository.getTask(id(args)); if (!task) throw new Error(`Task not found: ${id(args)}`); repository.deleteTask(task.id); hooks.onDataChanged?.(); return { summary: `Tarefa excluída: ${task.title}`, data: { id: task.id } }; } });
  register({ name: 'reminder.create', description: 'Create a local reminder.', risk: 'reversible', externallyVisible: true, inputSchema: { type: 'object', required: ['title', 'at'] }, validate: (args) => isText(args.title) && isIsoDateTime(args.at), execute: (args) => { const reminder = repository.createReminder({ title: title(args), category: 'important', status: 'open', schedule: { at: wallClock(args.at) } }); hooks.onDataChanged?.(); return { summary: `Lembrete criado: ${reminder.title}`, data: { id: reminder.id } }; } });
  register({ name: 'reminder.update', description: 'Update a local reminder title, date/time, or status.', risk: 'reversible', externallyVisible: true, inputSchema: { type: 'object', required: ['id'] }, validate: (args) => Boolean(id(args)) && (args.title === undefined || isText(args.title)) && (args.at === undefined || isIsoDateTime(args.at)) && entityStatus(args.status), execute: (args) => { const reminder = repository.updateReminder(id(args), { ...(args.title === undefined ? {} : { title: title(args) }), ...(args.at === undefined ? {} : { schedule: { at: wallClock(args.at) } }), ...(args.status === undefined ? {} : { status: args.status as 'open' | 'completed' | 'paused' }) }); hooks.onDataChanged?.(); return { summary: `Lembrete atualizado: ${reminder.title}`, data: { id: reminder.id } }; } });
  register({ name: 'reminder.delete', description: 'Permanently delete a local reminder.', risk: 'destructive', inputSchema: { type: 'object', required: ['id'] }, validate: (args) => Boolean(id(args)), execute: (args) => { const reminder = repository.listReminders().find((item) => item.id === id(args)); if (!reminder) throw new Error(`Reminder not found: ${id(args)}`); repository.deleteReminder(reminder.id); hooks.onDataChanged?.(); return { summary: `Lembrete excluído: ${reminder.title}`, data: { id: reminder.id } }; } });
  register({ name: 'block.create', description: 'Create a local schedule block.', risk: 'reversible', externallyVisible: true, inputSchema: { type: 'object', required: ['title', 'start', 'end', 'category'] }, validate: (args) => isText(args.title) && isIsoDateTime(args.start) && isIsoDateTime(args.end) && wallClock(args.start) < wallClock(args.end) && category(args.category), execute: (args) => { const input = { title: title(args), start: wallClock(args.start), end: wallClock(args.end), category: args.category as Category } satisfies Omit<ScheduleBlock, 'id'>; const validation = validateScheduleBlock({ ...input, id: 'assistant-preview' }, repository.listBlocks()); if (!validation.valid) throw new Error(validation.errors.join(' ')); const block = repository.createBlock(input); hooks.onDataChanged?.(); hooks.onBlockCreated?.(block); return { summary: `Bloco criado: ${block.title}`, data: { id: block.id } }; } });
  // Uma reunião pedida ao assistente vai para os três lugares onde a pessoa a procura: a agenda do Pixano, as
  // tarefas do dia (com prazo no horário) e o calendário conectado. É uma ação só, com uma confirmação.
  register({ name: 'meeting.create', description: 'Create a meeting: schedule block, task due at its start and an event in the connected calendar.', risk: 'external', externallyVisible: true, inputSchema: { type: 'object', required: ['title', 'start', 'end'] }, validate: (args) => isText(args.title) && isIsoDateTime(args.start) && isIsoDateTime(args.end) && wallClock(args.start) < wallClock(args.end), execute: async (args) => {
    // Uma reunião é compromisso fixo: é contra outros compromissos que um horário repetido merece atenção.
    const input = { title: title(args), start: wallClock(args.start), end: wallClock(args.end), category: 'work' as Category, isHard: true } satisfies Omit<ScheduleBlock, 'id'>;
    const validation = validateScheduleBlock({ ...input, id: 'assistant-preview' }, repository.listBlocks());
    if (!validation.valid) throw new Error(validation.errors.join(' '));
    const block = repository.createBlock(input);
    const minutes = Math.max(5, Math.round((Date.parse(input.end) - Date.parse(input.start)) / 60_000));
    const task = repository.createTask({ title: input.title, durationMinutes: Math.min(480, minutes), category: 'work', folder: 'Bento', status: 'open', deadline: input.start });
    hooks.onDataChanged?.();
    hooks.onBlockCreated?.(block);
    let calendar: string | null = null; let calendarFailed = false;
    try { calendar = (await hooks.calendar?.publish(block)) ?? null; } catch { calendarFailed = true; }
    const when = `${input.start.slice(8, 10)}/${input.start.slice(5, 7)} às ${input.start.slice(11, 16)}`;
    const where = calendar ? `na agenda, nas tarefas e no calendário "${calendar}"` : `na agenda e nas tarefas${calendarFailed ? '; o calendário recusou o evento' : hooks.calendar ? '. Para ir também ao seu calendário, escolha um calendário bidirecional em Ajustes › Integrations' : ''}`;
    return { summary: `Reunião marcada: ${input.title}, ${when}, ${where}.`, data: { blockId: block.id, taskId: task.id, calendar } };
  } });
  register({ name: 'block.update', description: 'Update a local schedule block.', risk: 'reversible', externallyVisible: true, inputSchema: { type: 'object', required: ['id'] }, validate: (args) => Boolean(id(args)) && (args.title === undefined || isText(args.title)) && (args.start === undefined || isIsoDateTime(args.start)) && (args.end === undefined || isIsoDateTime(args.end)) && (args.category === undefined || category(args.category)), execute: async (args) => { const current = repository.listBlocks().find((item) => item.id === id(args)); if (!current) throw new Error(`Block not found: ${id(args)}`); const next = { ...current, ...(args.title === undefined ? {} : { title: title(args) }), ...(args.start === undefined ? {} : { start: wallClock(args.start) }), ...(args.end === undefined ? {} : { end: wallClock(args.end) }), ...(args.category === undefined ? {} : { category: args.category as Category }) }; if (next.start >= next.end) throw new Error('Block start must be before end.'); const validation = validateScheduleBlock(next, repository.listBlocks().filter((item) => item.id !== next.id)); if (!validation.valid) throw new Error(validation.errors.join(' ')); const block = repository.updateBlock(next.id, next); hooks.onDataChanged?.();
    // Um bloco que já está no calendário conectado muda lá também: a confirmação no assistente é a aprovação.
    let calendar: string | null = null; let calendarFailed = false;
    if (args.start !== undefined || args.end !== undefined || args.title !== undefined) { try { calendar = (await hooks.calendar?.update?.(block)) ?? null; } catch { calendarFailed = true; } }
    const when = `${block.start.slice(8, 10)}/${block.start.slice(5, 7)} às ${block.start.slice(11, 16)}`;
    return { summary: `Bloco atualizado: ${block.title}, ${when}${calendar ? `, também no calendário "${calendar}"` : calendarFailed ? '; o calendário recusou a mudança' : ''}.`, data: { id: block.id, calendar } }; } });
  // Criar e apagar mudam os minutos planejados, então viram atividade; editar um bloco não é registrado.
  // listBlocks já devolve cópias: o bloco apagado continua legível para o registro.
  register({ name: 'block.delete', description: 'Permanently delete a local schedule block.', risk: 'destructive', inputSchema: { type: 'object', required: ['id'] }, validate: (args) => Boolean(id(args)), execute: (args) => { const block = repository.listBlocks().find((item) => item.id === id(args)); if (!block) throw new Error(`Block not found: ${id(args)}`); repository.deleteBlock(block.id); hooks.onDataChanged?.(); hooks.onBlockDeleted?.(block); return { summary: `Bloco excluído: ${block.title}`, data: { id: block.id } }; } });
  register({ name: 'note.create', description: 'Create a local note.', risk: 'reversible', externallyVisible: true, inputSchema: { type: 'object', required: ['title', 'content'] }, validate: (args) => isText(args.title) && isText(args.content, 10_000), execute: (args) => { const now = new Date().toISOString(); const note = repository.createNote({ title: title(args), content: args.content as string, folder: 'Bento', createdAt: now, updatedAt: now }); hooks.onDataChanged?.(); return { summary: `Nota criada: ${note.title}`, data: { id: note.id } }; } });
  register({ name: 'note.update', description: 'Update a local note title or content.', risk: 'reversible', externallyVisible: true, inputSchema: { type: 'object', required: ['id'] }, validate: (args) => Boolean(id(args)) && (args.title === undefined || isText(args.title)) && (args.content === undefined || isText(args.content, 10_000)), execute: (args) => { const note = repository.updateNote(id(args), { ...(args.title === undefined ? {} : { title: title(args) }), ...(args.content === undefined ? {} : { content: args.content as string }), updatedAt: new Date().toISOString() }); hooks.onDataChanged?.(); return { summary: `Nota atualizada: ${note.title}`, data: { id: note.id } }; } });
  register({ name: 'note.delete', description: 'Permanently delete a local note.', risk: 'destructive', inputSchema: { type: 'object', required: ['id'] }, validate: (args) => Boolean(id(args)), execute: (args) => { const note = repository.listNotes().find((item) => item.id === id(args)); if (!note) throw new Error(`Note not found: ${id(args)}`); repository.deleteNote(note.id); hooks.onDataChanged?.(); return { summary: `Nota excluída: ${note.title}`, data: { id: note.id } }; } });
  register({ name: 'habit.complete', description: 'Mark a local habit as done on a day.', risk: 'reversible', externallyVisible: true, inputSchema: { type: 'object', required: ['id', 'date'] }, validate: (args) => Boolean(id(args)) && typeof args.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.date), execute: (args) => { const habit = repository.setHabitCompletion(id(args), String(args.date), true); hooks.onDataChanged?.(); return { summary: `Hábito feito: ${habit.title}`, data: { id: habit.id } }; } });
  register({ name: 'focus.start', description: 'Start a local focus session.', risk: 'reversible', externallyVisible: true, inputSchema: { type: 'object' }, validate: () => true, execute: () => { hooks.onFocusStarted?.(); return { summary: 'Sessão de foco iniciada' }; } });
  // Risco 'external': a política sempre exige o cartão Confirmar/Cancelar antes
  // de executar, e a preparação no processo principal só é consumida aqui.
  if (hooks.integrations) register({ name: 'integration.send', description: 'Send a message through a connected integration after explicit confirmation.', risk: 'external', inputSchema: { type: 'object', required: ['connectorId', 'kind', 'payload'] }, validate: (args) => isConnectorId(args.connectorId) && isText(args.kind, 120) && Boolean(args.payload) && typeof args.payload === 'object' && !Array.isArray(args.payload), execute: async (args) => {
    const prepared = await hooks.integrations!.prepare({ connectorId: String(args.connectorId), kind: String(args.kind), payload: args.payload as Record<string, unknown> });
    const result = await hooks.integrations!.executeApproved({ actionId: prepared.id, confirmationId: prepared.confirmationId });
    if (!result?.ok) throw new Error(`A ação remota não foi aceita por ${prepared.connectorId}.`);
    return { summary: `Ação enviada para ${prepared.connectorId}: ${prepared.kind}`, data: { connectorId: prepared.connectorId, ...(result.remoteId === undefined ? {} : { remoteId: result.remoteId }) } };
  } });
  return registry;
}

const match = (message: string, expression: RegExp) => message.match(expression)?.[1]?.trim();
type NamedEntity = Readonly<{ id: string; title: string }>;
const resolveEntity = (entities: readonly NamedEntity[], reference: string) => {
  const normalized = reference.trim().toLocaleLowerCase('pt-BR');
  const matches = entities.filter((item) => item.id === reference || item.title.toLocaleLowerCase('pt-BR') === normalized);
  return matches.length === 1 ? matches[0] : undefined;
};

const unclearTime = (said: string) => `Não entendi o horário "${said.trim()}". Diga, por exemplo, "às 15h" ou "às 3 da tarde".`;


type Scheduling = Readonly<{ title: string; day: string; start: string; end: string; meeting: boolean }>;
/**
 * Um horário pedido vira reunião (agenda, tarefas e calendário) ou bloco. O horário ocupado é dito antes
 * da confirmação: confirmar e só então ouvir "conflita" é perder um passo.
 */
function schedulingProposal(repository: LocalRepository, { title, day, start: startTime, end: endTime, meeting }: Scheduling): { toolCalls: AiToolCall[]; clarification: string | null; meetingReply: string | null } {
  const start = `${day}T${startTime}:00`; const end = `${day}T${endTime}:00`;
  if (!meeting) return { toolCalls: [{ name: 'block.create', arguments: { title, start, end, category: 'work' } }], clarification: null, meetingReply: null };
  // Marcar no mesmo horário de outra coisa não é problema: uma demanda (produzir um post) divide o
  // horário com uma reunião. A pergunta só conta o que já está lá, e avisa em destaque quando é outro
  // compromisso fixo (o almoço, outra reunião) — quem decide é a pessoa, ao confirmar.
  const blocks = repository.listBlocks();
  const overlaps = findConflicts({ id: 'proposed', title, start, end, category: 'work', isHard: true }, blocks).map((conflict) => ({ conflict, block: blocks.find((block) => block.id === conflict.existingId) })).filter((item) => item.block);
  const names = (severity: 'hard' | 'soft') => overlaps.filter((item) => item.conflict.severity === severity).map((item) => `"${item.block!.title}"`).join(' e ');
  const notes = [names('hard') ? `Atenção: no mesmo horário já tem o compromisso ${names('hard')}.` : '', names('soft') ? `No mesmo horário: ${names('soft')}.` : ''].filter(Boolean).join(' ');
  const question = `Marcar "${title}" em ${day.slice(8, 10)}/${day.slice(5, 7)}, das ${startTime} às ${endTime}, na agenda, nas tarefas e no calendário conectado?`;
  return { toolCalls: [{ name: 'meeting.create', arguments: { title, start, end } }], clarification: null, meetingReply: notes ? `${notes} ${question}` : question };
}

/** O que o cérebro offline entendeu de um pedido, com dia e horário como a pessoa os disse. */
export type SpokenIntent = Readonly<{ action: 'meeting' | 'task' | 'reminder' | 'note' | 'focus' | 'agenda' | 'move' | 'complete' | 'delete' | 'none'; title: string; day: string; time: string; endTime: string }>;

const capitalized = (text: string) => (text ? text[0]!.toLocaleUpperCase('pt-BR') + text.slice(1) : text);
const plusHour = (time: string) => { const total = Math.min(23 * 60 + 59, Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) + 60); return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`; };

/**
 * A intenção extraída pelo cérebro offline vira a mesma proposta que um comando dito vira: dia e horário
 * lidos pelo código (nunca pelo modelo), conflito conferido e confirmação antes de qualquer escrita.
 * `null` quando não é um pedido de ação.
 */
export function intentProposal(intent: SpokenIntent, request: AiProviderRequest, repository: LocalRepository, subject: Subject | null = null): AiProviderProposal | null {
  const instant = new Date(request.currentTime);
  const today = localDateKey(Number.isNaN(instant.getTime()) ? new Date() : instant);
  // O modelo às vezes deixa no título o dia ou o horário que já vieram à parte ("tenho dentista na
  // quinta"): o título fica só com o assunto.
  const withoutWhen = [intent.day, intent.time, intent.endTime].map((part) => part.trim()).filter(Boolean)
    .reduce((text, part) => text.replace(new RegExp(`\\s*(?:n[ao]s?\\s+|às?\\s+|as\\s+|de\\s+|para\\s+)?${part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'iu'), ''), intent.title);
  const title = capitalized(withoutWhen.trim().replace(/^(?:tenho|preciso(?:\s+de)?|vou ter)\s+/iu, '').replace(/[.!?…]+$/u, '').trim().slice(0, 200));
  const said = (value: string) => value.trim();
  const dayOf = (): string | null => { if (!said(intent.day)) return today; const found = takeSpokenDay(said(intent.day), today); return found.days === null ? null : shiftDayKey(today, found.days); };
  const done = (toolCalls: AiToolCall[], reply: string, clarification = false): AiProviderProposal => ({ reply, toolCalls, notchPresentation: null, providerMetadata: { model: 'local-tool-provider', ...(clarification ? { finishReason: 'needs-clarification' } : {}) } });
  const ask = (text: string) => done([], text, true);
  switch (intent.action) {
    // Mexer no que já existe: o assunto é o nome da coisa, e dia e horário são o destino.
    case 'move': case 'complete': case 'delete': {
      const when = [said(intent.day), said(intent.time)].filter(Boolean).join(' ');
      return entityProposal(repository, { action: intent.action, target: intent.title.trim(), when }, today, subject).proposal;
    }
    case 'meeting': {
      const day = dayOf();
      if (!day) return ask(`Não entendi o dia "${said(intent.day)}". Diga, por exemplo, "amanhã" ou "sexta".`);
      if (!said(intent.time)) return ask('Para que horário? Diga, por exemplo, "amanhã às 15h" ou "hoje das 14h às 16h".');
      const start = parseSpokenTime(intent.time);
      if (!start) return ask(unclearTime(intent.time));
      const end = said(intent.endTime) ? parseSpokenTime(intent.endTime) : plusHour(start);
      if (!end || end <= start) return ask(unclearTime(intent.endTime));
      const scheduled = schedulingProposal(repository, { title: title || 'Reunião', day, start, end, meeting: true });
      return scheduled.clarification ? ask(scheduled.clarification) : done(scheduled.toolCalls, scheduled.meetingReply!);
    }
    case 'task': return title ? done([{ name: 'task.create', arguments: { title, durationMinutes: 60 } }], `Criar a tarefa "${title}"?`) : null;
    case 'reminder': {
      if (!title) return null;
      const day = dayOf();
      if (!day) return ask(`Não entendi o dia "${said(intent.day)}". Diga, por exemplo, "amanhã" ou "sexta".`);
      if (!said(intent.time)) return ask(`Para que horário é o lembrete "${title}"?`);
      const time = parseSpokenTime(intent.time);
      if (!time) return ask(unclearTime(intent.time));
      return done([{ name: 'reminder.create', arguments: { title, at: `${day}T${time}:00` } }], `Lembrar de "${title}" em ${day.slice(8, 10)}/${day.slice(5, 7)} às ${time}?`);
    }
    case 'note': return title ? done([{ name: 'note.create', arguments: { title, content: title } }], `Anotar "${title}"?`) : null;
    case 'focus': return done([{ name: 'focus.start', arguments: {} }], 'Começar uma sessão de foco?');
    case 'agenda': return done([{ name: 'search.schedule', arguments: {} }], 'Olhando a sua agenda.');
    default: return null;
  }
}

function localProposal(request: AiProviderRequest, repository: LocalRepository, subject: Subject | null = null): { proposal: AiProviderProposal; subject: Subject | null } {
  const message = normalizeSpokenCommand(request.message); const lower = message.toLocaleLowerCase('pt-BR'); let toolCalls: AiToolCall[] = []; let clarification: string | null = null; let meetingReply: string | null = null;
  // `currentTime` chega como instante em UTC (`toISOString`), mas "das 22:00 às 23:00" é o relógio
  // de quem pediu. Fatiar o texto UTC dava o dia e a hora de Greenwich: a leste e a oeste o bloco
  // nascia no dia errado. Dia de calendário sai sempre de `date-context`, nunca de uma fatia de ISO.
  const instant = new Date(request.currentTime);
  const now = Number.isNaN(instant.getTime()) ? new Date() : instant;
  const today = localDateKey(now);
  const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const task = match(message, /^(?:crie|criar|adicione|adicionar)\s+(?:uma?\s+)?tarefa\s*:?[\s-]*(.+)$/i);
  const note = match(message, /^(?:crie|criar|adicione|adicionar)\s+(?:uma?\s+)?nota\s*:?[\s-]*(.+)$/i);
  // Os horários chegam como a ditação escreve ("15h", "3 da tarde") e são lidos por `parseSpokenTime`.
  const schedule = parseScheduleRequest(message, today);
  const reminder = message.match(/^(?:crie|criar|adicione|adicionar)\s+(?:um\s+)?lembrete\s*:?[\s-]*(.+?)(?:\s+(?:para\s+)?(?:às?|as)\s+(.+))?$/iu);
  const mutation = message.match(/^(?:edite|editar|renomeie|renomear)\s+(?:a\s+|o\s+)?(tarefa|lembrete|bloco|nota)\s*:\s*(.+?)\s+(?:para|como)\s+(.+)$/i);
  const removal = message.match(/^(?:exclua|excluir|apague|apagar|remova|remover)\s+(?:a\s+|o\s+)?(tarefa|lembrete|bloco|nota)\s*:\s*(.+)$/i);
  const slackPost = message.match(/^(?:envie|enviar|poste|postar|publique|publicar)\s+(?:uma\s+)?(?:mensagem\s+)?(?:no|para\s+o)\s+slack\s+#?([\w-]{1,80})\s*:\s*(.+)$/i);
  // "Adia a reunião com a Ana para as 16h", "já fiz a academia", "apaga isso": algo que já existe.
  const entity = mutation || removal ? null : parseEntityCommand(message);
  if (entity) return entityProposal(repository, entity, today, subject);
  if (mutation || removal) {
    const operation = mutation ?? removal!;
    const kind = operation[1]!.toLocaleLowerCase('pt-BR');
    const reference = operation[2]!.trim();
    const descriptor = kind === 'tarefa' ? { name: 'task', entities: repository.listTasks() } : kind === 'lembrete' ? { name: 'reminder', entities: repository.listReminders() } : kind === 'bloco' ? { name: 'block', entities: repository.listBlocks() } : { name: 'note', entities: repository.listNotes() };
    const entity = resolveEntity(descriptor.entities, reference);
    if (entity) toolCalls = removal ? [{ name: `${descriptor.name}.delete`, arguments: { id: entity.id } }] : [{ name: `${descriptor.name}.update`, arguments: { id: entity.id, title: mutation![3].trim() } }];
  } else if (task) toolCalls = [{ name: 'task.create', arguments: { title: task, durationMinutes: 60 } }];
  else if (note) toolCalls = [{ name: 'note.create', arguments: { title: note, content: note } }];
  else if (schedule) {
    if (schedule.kind === 'unclear') clarification = schedule.said ? unclearTime(schedule.said) : 'Para que horário? Diga, por exemplo, "amanhã às 15h" ou "hoje das 14h às 16h".';
    else ({ toolCalls, clarification, meetingReply } = schedulingProposal(repository, { title: schedule.title, day: shiftDayKey(today, schedule.days), start: schedule.start, end: schedule.end, meeting: schedule.meeting }));
  }
  else if (reminder) {
    // Um horário dito e não entendido nunca vira "agora": o lembrete tocaria na hora errada.
    // "amanhã" pode vir no título ("ligar amanhã às 15h") ou no horário ("às 15h de amanhã").
    const inTitle = takeSpokenDay(reminder[1]!, today);
    const inTime = reminder[2] ? takeSpokenDay(reminder[2], today) : { days: null, rest: '' };
    const days = inTitle.days ?? inTime.days ?? 0;
    const time = reminder[2] ? parseSpokenTime(inTime.rest) : nowTime;
    if (time) toolCalls = [{ name: 'reminder.create', arguments: { title: inTitle.rest || reminder[1]!.trim(), at: `${shiftDayKey(today, days)}T${time}:00` } }];
    else clarification = unclearTime(reminder[2]!);
  }
  else if (slackPost) toolCalls = [{ name: 'integration.send', arguments: { connectorId: 'slack', kind: 'slack.post', payload: { channel: `#${slackPost[1].trim()}`, text: slackPost[2].trim() } } }];
  // "Inicie o foco", "começa um foco": a fala usa o imperativo tanto quanto o infinitivo.
  else if (/^(inici[ae]r?|come[cç][ae]r?|start)\b.*(foco|focus)/iu.test(message)) toolCalls = [{ name: 'focus.start', arguments: {} }];
  else if (/(agenda|calend|hor.rio|schedule|today|hoje)/u.test(lower)) toolCalls = [{ name: 'search.schedule', arguments: {} }];
  else if (/(lembrete|remind)/u.test(lower)) toolCalls = [{ name: 'search.reminders', arguments: {} }];
  else if (/(taref|task|pend.ncia|todo)/u.test(lower)) toolCalls = [{ name: 'search.tasks', arguments: {} }];
  const reply = clarification ?? meetingReply ?? (toolCalls.length ? 'Preparei uma ação local para sua revisão.' : 'Posso ajudar com tarefas, agenda, lembretes, notas e foco locais.');
  // A pergunta de volta é a resposta certa: marcada, para o cérebro offline não responder por cima dela.
  return { proposal: { reply, toolCalls, notchPresentation: null, providerMetadata: { model: 'local-tool-provider', ...(clarification ? { finishReason: 'needs-clarification' } : {}) } }, subject: subjectOf(toolCalls) ?? subject };
}

const CREATED: Record<string, Subject['kind']> = { 'task.create': 'task', 'meeting.create': 'block', 'block.create': 'block', 'reminder.create': 'reminder', 'note.create': 'note' };
/** O que uma proposta de criação põe em assunto: "cria a tarefa X" e, em seguida, "deixa isso pra amanhã". */
function subjectOf(toolCalls: readonly AiToolCall[]): Subject | null {
  const created = toolCalls.find((call) => CREATED[call.name] && typeof call.arguments.title === 'string');
  return created ? { kind: CREATED[created.name]!, title: String(created.arguments.title) } : null;
}

/**
 * As ferramentas locais do assistente. Guardam o assunto da conversa — o que foi criado ou mexido por último —
 * para "deixa isso pra amanhã" saber do que se fala.
 */
export class LocalToolProvider implements AiProvider {
  readonly id = 'local-tools';
  readonly label = 'Pixano local tools';
  private subject: Subject | null = null;
  constructor(private readonly repository: LocalRepository) {}
  fromIntent(intent: SpokenIntent, request: AiProviderRequest): AiProviderProposal | null {
    const proposal = intentProposal(intent, request, this.repository, this.subject);
    if (proposal) this.subject = subjectOf(proposal.toolCalls) ?? subjectFromCalls(this.repository, proposal.toolCalls) ?? this.subject;
    return proposal;
  }
  async generate(request: AiProviderRequest, signal: AbortSignal): Promise<AiProviderProposal> {
    if (signal.aborted) throw new DOMException('The AI turn was cancelled.', 'AbortError');
    const { proposal, subject } = localProposal(request, this.repository, this.subject);
    this.subject = subject;
    return proposal;
  }
}

/** O alvo de uma proposta sobre algo que já existe, lido pelo id. */
function subjectFromCalls(repository: LocalRepository, toolCalls: readonly AiToolCall[]): Subject | null {
  const call = toolCalls.find((item) => typeof item.arguments.id === 'string');
  if (!call) return null;
  const idValue = String(call.arguments.id);
  const kind = call.name.split('.')[0] as Subject['kind'];
  const entity = [...repository.listBlocks(), ...repository.listTasks(), ...repository.listReminders(), ...repository.listHabits(), ...repository.listNotes()].find((item) => item.id === idValue);
  return entity ? { kind, id: idValue, title: entity.title } : null;
}

export function createLocalHibiRuntime(repository: LocalRepository, hooks: Hooks = {}, provider: AiProvider = new LocalToolProvider(repository), fallbackProvider: AiProvider = new HeuristicAiProvider(), fallbackPolicy: AiFallbackPolicy | (() => AiFallbackPolicy) = 'automatic'): AiTurnRuntime {
  const registry = createLocalToolRegistry(repository, hooks);
  return new AiTurnRuntime({ registry, policy: new AiToolPolicy(registry), provider, fallbackProvider, fallbackPolicy, onAudit: hooks.onAudit, onUsage: hooks.onUsage, context: { get tasks() { return repository.listTasks().map((task) => ({ id: task.id, title: task.title, dueAt: task.deadline })); }, get reminders() { return repository.listReminders().map((reminder) => ({ id: reminder.id, title: reminder.title, nextAt: reminder.schedule.at })); }, get schedule() { return repository.listBlocks(); }, get notes() { return repository.listNotes().map((note) => ({ id: note.id, title: note.title })); } } });
}

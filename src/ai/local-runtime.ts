import { LocalRepository } from '../data/local-repository';
import { validateScheduleBlock } from '../domain/conflicts';
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
type Hooks = Readonly<{ onDataChanged?: () => void; onTaskStatusChanged?: (before: Task, after: Task) => void; onFocusStarted?: () => void; onAudit?: (event: AiAuditEvent) => void; onUsage?: (event: AiRuntimeUsageEvent) => void; integrations?: IntegrationActionBridge }>;
const isText = (value: unknown, max = 240): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const isIsoDateTime = (value: unknown): value is string => isText(value, 40) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(value);
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
  register({ name: 'task.update', description: 'Update a local task title, duration, or status.', risk: 'reversible', externallyVisible: true, inputSchema: { type: 'object', required: ['id'] }, validate: (args) => Boolean(id(args)) && (args.title === undefined || isText(args.title)) && (args.durationMinutes === undefined || Number.isInteger(args.durationMinutes) && Number(args.durationMinutes) >= 5 && Number(args.durationMinutes) <= 480) && entityStatus(args.status), execute: (args) => { const current = repository.getTask(id(args)); const before = current && { ...current }; const task = repository.updateTask(id(args), { ...(args.title === undefined ? {} : { title: title(args) }), ...(args.durationMinutes === undefined ? {} : { durationMinutes: Number(args.durationMinutes) }), ...(args.status === undefined ? {} : { status: args.status as 'open' | 'completed' | 'paused' }) }); hooks.onDataChanged?.(); if (before && before.status !== task.status) hooks.onTaskStatusChanged?.(before, task); return { summary: `Tarefa atualizada: ${task.title}`, data: { id: task.id } }; } });
  register({ name: 'task.delete', description: 'Permanently delete a local task.', risk: 'destructive', inputSchema: { type: 'object', required: ['id'] }, validate: (args) => Boolean(id(args)), execute: (args) => { const task = repository.getTask(id(args)); if (!task) throw new Error(`Task not found: ${id(args)}`); repository.deleteTask(task.id); hooks.onDataChanged?.(); return { summary: `Tarefa excluída: ${task.title}`, data: { id: task.id } }; } });
  register({ name: 'reminder.create', description: 'Create a local reminder.', risk: 'reversible', externallyVisible: true, inputSchema: { type: 'object', required: ['title', 'at'] }, validate: (args) => isText(args.title) && isIsoDateTime(args.at), execute: (args) => { const reminder = repository.createReminder({ title: title(args), category: 'important', status: 'open', schedule: { at: args.at as string } }); hooks.onDataChanged?.(); return { summary: `Lembrete criado: ${reminder.title}`, data: { id: reminder.id } }; } });
  register({ name: 'reminder.update', description: 'Update a local reminder title, date/time, or status.', risk: 'reversible', externallyVisible: true, inputSchema: { type: 'object', required: ['id'] }, validate: (args) => Boolean(id(args)) && (args.title === undefined || isText(args.title)) && (args.at === undefined || isIsoDateTime(args.at)) && entityStatus(args.status), execute: (args) => { const reminder = repository.updateReminder(id(args), { ...(args.title === undefined ? {} : { title: title(args) }), ...(args.at === undefined ? {} : { schedule: { at: args.at as string } }), ...(args.status === undefined ? {} : { status: args.status as 'open' | 'completed' | 'paused' }) }); hooks.onDataChanged?.(); return { summary: `Lembrete atualizado: ${reminder.title}`, data: { id: reminder.id } }; } });
  register({ name: 'reminder.delete', description: 'Permanently delete a local reminder.', risk: 'destructive', inputSchema: { type: 'object', required: ['id'] }, validate: (args) => Boolean(id(args)), execute: (args) => { const reminder = repository.listReminders().find((item) => item.id === id(args)); if (!reminder) throw new Error(`Reminder not found: ${id(args)}`); repository.deleteReminder(reminder.id); hooks.onDataChanged?.(); return { summary: `Lembrete excluído: ${reminder.title}`, data: { id: reminder.id } }; } });
  register({ name: 'block.create', description: 'Create a local schedule block.', risk: 'reversible', externallyVisible: true, inputSchema: { type: 'object', required: ['title', 'start', 'end', 'category'] }, validate: (args) => isText(args.title) && isIsoDateTime(args.start) && isIsoDateTime(args.end) && String(args.start) < String(args.end) && category(args.category), execute: (args) => { const input = { title: title(args), start: args.start as string, end: args.end as string, category: args.category as Category } satisfies Omit<ScheduleBlock, 'id'>; const validation = validateScheduleBlock({ ...input, id: 'assistant-preview' }, repository.listBlocks()); if (!validation.valid) throw new Error(validation.errors.join(' ')); const block = repository.createBlock(input); hooks.onDataChanged?.(); return { summary: `Bloco criado: ${block.title}`, data: { id: block.id } }; } });
  register({ name: 'block.update', description: 'Update a local schedule block.', risk: 'reversible', externallyVisible: true, inputSchema: { type: 'object', required: ['id'] }, validate: (args) => Boolean(id(args)) && (args.title === undefined || isText(args.title)) && (args.start === undefined || isIsoDateTime(args.start)) && (args.end === undefined || isIsoDateTime(args.end)) && (args.category === undefined || category(args.category)), execute: (args) => { const current = repository.listBlocks().find((item) => item.id === id(args)); if (!current) throw new Error(`Block not found: ${id(args)}`); const next = { ...current, ...(args.title === undefined ? {} : { title: title(args) }), ...(args.start === undefined ? {} : { start: args.start as string }), ...(args.end === undefined ? {} : { end: args.end as string }), ...(args.category === undefined ? {} : { category: args.category as Category }) }; if (next.start >= next.end) throw new Error('Block start must be before end.'); const validation = validateScheduleBlock(next, repository.listBlocks().filter((item) => item.id !== next.id)); if (!validation.valid) throw new Error(validation.errors.join(' ')); const block = repository.updateBlock(next.id, next); hooks.onDataChanged?.(); return { summary: `Bloco atualizado: ${block.title}`, data: { id: block.id } }; } });
  register({ name: 'block.delete', description: 'Permanently delete a local schedule block.', risk: 'destructive', inputSchema: { type: 'object', required: ['id'] }, validate: (args) => Boolean(id(args)), execute: (args) => { const block = repository.listBlocks().find((item) => item.id === id(args)); if (!block) throw new Error(`Block not found: ${id(args)}`); repository.deleteBlock(block.id); hooks.onDataChanged?.(); return { summary: `Bloco excluído: ${block.title}`, data: { id: block.id } }; } });
  register({ name: 'note.create', description: 'Create a local note.', risk: 'reversible', externallyVisible: true, inputSchema: { type: 'object', required: ['title', 'content'] }, validate: (args) => isText(args.title) && isText(args.content, 10_000), execute: (args) => { const now = new Date().toISOString(); const note = repository.createNote({ title: title(args), content: args.content as string, folder: 'Bento', createdAt: now, updatedAt: now }); hooks.onDataChanged?.(); return { summary: `Nota criada: ${note.title}`, data: { id: note.id } }; } });
  register({ name: 'note.update', description: 'Update a local note title or content.', risk: 'reversible', externallyVisible: true, inputSchema: { type: 'object', required: ['id'] }, validate: (args) => Boolean(id(args)) && (args.title === undefined || isText(args.title)) && (args.content === undefined || isText(args.content, 10_000)), execute: (args) => { const note = repository.updateNote(id(args), { ...(args.title === undefined ? {} : { title: title(args) }), ...(args.content === undefined ? {} : { content: args.content as string }), updatedAt: new Date().toISOString() }); hooks.onDataChanged?.(); return { summary: `Nota atualizada: ${note.title}`, data: { id: note.id } }; } });
  register({ name: 'note.delete', description: 'Permanently delete a local note.', risk: 'destructive', inputSchema: { type: 'object', required: ['id'] }, validate: (args) => Boolean(id(args)), execute: (args) => { const note = repository.listNotes().find((item) => item.id === id(args)); if (!note) throw new Error(`Note not found: ${id(args)}`); repository.deleteNote(note.id); hooks.onDataChanged?.(); return { summary: `Nota excluída: ${note.title}`, data: { id: note.id } }; } });
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

function localProposal(request: AiProviderRequest, repository: LocalRepository): AiProviderProposal {
  const message = request.message.trim(); const lower = message.toLocaleLowerCase('pt-BR'); let toolCalls: AiToolCall[] = [];
  const task = match(message, /^(?:crie|criar|adicione|adicionar)\s+(?:uma?\s+)?tarefa\s*:?[\s-]*(.+)$/i);
  const note = match(message, /^(?:crie|criar|adicione|adicionar)\s+(?:uma?\s+)?nota\s*:?[\s-]*(.+)$/i);
  const block = message.match(/^(?:crie|criar|adicione|adicionar)\s+(?:um\s+)?bloco\s*:?[\s-]*(.+?)\s+(?:das?\s+)?(\d{1,2}:\d{2})\s+(?:às?|a)\s+(\d{1,2}:\d{2})$/i);
  const reminder = message.match(/^(?:crie|criar|adicione|adicionar)\s+(?:um\s+)?lembrete\s*:?[\s-]*(.+?)(?:\s+às?\s+(\d{1,2}:\d{2}))?$/i);
  const mutation = message.match(/^(?:edite|editar|renomeie|renomear)\s+(?:a\s+|o\s+)?(tarefa|lembrete|bloco|nota)\s*:\s*(.+?)\s+(?:para|como)\s+(.+)$/i);
  const removal = message.match(/^(?:exclua|excluir|apague|apagar|remova|remover)\s+(?:a\s+|o\s+)?(tarefa|lembrete|bloco|nota)\s*:\s*(.+)$/i);
  const slackPost = message.match(/^(?:envie|enviar|poste|postar|publique|publicar)\s+(?:uma\s+)?(?:mensagem\s+)?(?:no|para\s+o)\s+slack\s+#?([\w-]{1,80})\s*:\s*(.+)$/i);
  if (mutation || removal) {
    const operation = mutation ?? removal!;
    const kind = operation[1]!.toLocaleLowerCase('pt-BR');
    const reference = operation[2]!.trim();
    const descriptor = kind === 'tarefa' ? { name: 'task', entities: repository.listTasks() } : kind === 'lembrete' ? { name: 'reminder', entities: repository.listReminders() } : kind === 'bloco' ? { name: 'block', entities: repository.listBlocks() } : { name: 'note', entities: repository.listNotes() };
    const entity = resolveEntity(descriptor.entities, reference);
    if (entity) toolCalls = removal ? [{ name: `${descriptor.name}.delete`, arguments: { id: entity.id } }] : [{ name: `${descriptor.name}.update`, arguments: { id: entity.id, title: mutation![3].trim() } }];
  } else if (task) toolCalls = [{ name: 'task.create', arguments: { title: task, durationMinutes: 60 } }];
  else if (note) toolCalls = [{ name: 'note.create', arguments: { title: note, content: note } }];
  else if (block) toolCalls = [{ name: 'block.create', arguments: { title: block[1].trim(), start: `${request.currentTime.slice(0, 10)}T${block[2].padStart(5, '0')}:00-03:00`, end: `${request.currentTime.slice(0, 10)}T${block[3].padStart(5, '0')}:00-03:00`, category: 'work' } }];
  else if (reminder) { const time = reminder[2] ?? request.currentTime.slice(11, 16); toolCalls = [{ name: 'reminder.create', arguments: { title: reminder[1].trim(), at: `${request.currentTime.slice(0, 10)}T${time}:00-03:00` } }]; }
  else if (slackPost) toolCalls = [{ name: 'integration.send', arguments: { connectorId: 'slack', kind: 'slack.post', payload: { channel: `#${slackPost[1].trim()}`, text: slackPost[2].trim() } } }];
  else if (/^(iniciar|começar|comecar|start).*(foco|focus)/i.test(message)) toolCalls = [{ name: 'focus.start', arguments: {} }];
  else if (/(agenda|calend|hor.rio|schedule|today|hoje)/u.test(lower)) toolCalls = [{ name: 'search.schedule', arguments: {} }];
  else if (/(lembrete|remind)/u.test(lower)) toolCalls = [{ name: 'search.reminders', arguments: {} }];
  else if (/(taref|task|pend.ncia|todo)/u.test(lower)) toolCalls = [{ name: 'search.tasks', arguments: {} }];
  const reply = toolCalls.length ? 'Preparei uma ação local para sua revisão.' : 'Posso ajudar com tarefas, agenda, lembretes, notas e foco locais.';
  return { reply, toolCalls, notchPresentation: null, providerMetadata: { model: 'local-tool-provider' } };
}

export class LocalToolProvider implements AiProvider { readonly id = 'local-tools'; readonly label = 'Hibi local tools'; constructor(private readonly repository: LocalRepository) {} async generate(request: AiProviderRequest, signal: AbortSignal): Promise<AiProviderProposal> { if (signal.aborted) throw new DOMException('The AI turn was cancelled.', 'AbortError'); return localProposal(request, this.repository); } }

export function createLocalHibiRuntime(repository: LocalRepository, hooks: Hooks = {}, provider: AiProvider = new LocalToolProvider(repository), fallbackProvider: AiProvider = new HeuristicAiProvider(), fallbackPolicy: AiFallbackPolicy | (() => AiFallbackPolicy) = 'automatic'): AiTurnRuntime {
  const registry = createLocalToolRegistry(repository, hooks);
  return new AiTurnRuntime({ registry, policy: new AiToolPolicy(registry), provider, fallbackProvider, fallbackPolicy, onAudit: hooks.onAudit, onUsage: hooks.onUsage, context: { get tasks() { return repository.listTasks().map((task) => ({ id: task.id, title: task.title, dueAt: task.deadline })); }, get reminders() { return repository.listReminders().map((reminder) => ({ id: reminder.id, title: reminder.title, nextAt: reminder.schedule.at })); }, get schedule() { return repository.listBlocks(); }, get notes() { return repository.listNotes().map((note) => ({ id: note.id, title: note.title })); } } });
}

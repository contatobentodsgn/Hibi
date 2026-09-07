import { LocalRepository } from '../data/local-repository';
import { validateScheduleBlock } from '../domain/conflicts';
import type { Category, ScheduleBlock } from '../domain/models';
import { AiToolPolicy } from './policy';
import type { AiProvider, AiProviderProposal, AiProviderRequest, AiToolCall } from './contracts';
import { AiTurnRuntime } from './runtime';
import { ToolRegistry, type HibiTool } from './tools';

type Hooks = Readonly<{ onDataChanged?: () => void; onFocusStarted?: () => void }>;
const isText = (value: unknown, max = 240): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const isIsoDateTime = (value: unknown): value is string => isText(value, 40) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(value);
const category = (value: unknown): value is Category => ['work', 'break', 'learning', 'important', 'wellbeing'].includes(String(value));
const title = (arguments_: Record<string, unknown>) => String(arguments_.title ?? '').trim();

export function createLocalToolRegistry(repository: LocalRepository, hooks: Hooks = {}): ToolRegistry {
  const register = (tool: HibiTool) => registry.register(tool);
  const registry = new ToolRegistry();
  register({ name: 'search.schedule', description: 'Read local schedule blocks.', risk: 'read', inputSchema: { type: 'object' }, validate: () => true, execute: () => ({ summary: `${repository.listBlocks().length} blocos na agenda`, data: { count: repository.listBlocks().length } }) });
  register({ name: 'search.tasks', description: 'Read local tasks.', risk: 'read', inputSchema: { type: 'object' }, validate: () => true, execute: () => ({ summary: `${repository.listTasks().filter((task) => task.status !== 'completed').length} tarefas abertas` }) });
  register({ name: 'search.reminders', description: 'Read local reminders.', risk: 'read', inputSchema: { type: 'object' }, validate: () => true, execute: () => ({ summary: `${repository.listReminders().filter((reminder) => reminder.status !== 'paused').length} lembretes ativos` }) });
  register({ name: 'task.create', description: 'Create a local task.', risk: 'reversible', externallyVisible: true, inputSchema: { type: 'object', required: ['title'] }, validate: (args) => isText(args.title) && (args.durationMinutes === undefined || Number.isInteger(args.durationMinutes) && Number(args.durationMinutes) >= 5 && Number(args.durationMinutes) <= 480), execute: (args) => { const task = repository.createTask({ title: title(args), durationMinutes: Number(args.durationMinutes ?? 60), category: 'work', folder: 'Bento', status: 'open' }); hooks.onDataChanged?.(); return { summary: `Tarefa criada: ${task.title}`, data: { id: task.id } }; } });
  register({ name: 'reminder.create', description: 'Create a local reminder.', risk: 'reversible', externallyVisible: true, inputSchema: { type: 'object', required: ['title', 'at'] }, validate: (args) => isText(args.title) && isIsoDateTime(args.at), execute: (args) => { const reminder = repository.createReminder({ title: title(args), category: 'important', status: 'open', schedule: { at: args.at as string } }); hooks.onDataChanged?.(); return { summary: `Lembrete criado: ${reminder.title}`, data: { id: reminder.id } }; } });
  register({ name: 'block.create', description: 'Create a local schedule block.', risk: 'reversible', externallyVisible: true, inputSchema: { type: 'object', required: ['title', 'start', 'end', 'category'] }, validate: (args) => isText(args.title) && isIsoDateTime(args.start) && isIsoDateTime(args.end) && String(args.start) < String(args.end) && category(args.category), execute: (args) => { const input = { title: title(args), start: args.start as string, end: args.end as string, category: args.category as Category } satisfies Omit<ScheduleBlock, 'id'>; const validation = validateScheduleBlock({ ...input, id: 'assistant-preview' }, repository.listBlocks()); if (!validation.valid) throw new Error(validation.errors.join(' ')); const block = repository.createBlock(input); hooks.onDataChanged?.(); return { summary: `Bloco criado: ${block.title}`, data: { id: block.id } }; } });
  register({ name: 'note.create', description: 'Create a local note.', risk: 'reversible', externallyVisible: true, inputSchema: { type: 'object', required: ['title', 'content'] }, validate: (args) => isText(args.title) && isText(args.content, 10_000), execute: (args) => { const now = new Date().toISOString(); const note = repository.createNote({ title: title(args), content: args.content as string, folder: 'Bento', createdAt: now, updatedAt: now }); hooks.onDataChanged?.(); return { summary: `Nota criada: ${note.title}`, data: { id: note.id } }; } });
  register({ name: 'focus.start', description: 'Start a local focus session.', risk: 'reversible', externallyVisible: true, inputSchema: { type: 'object' }, validate: () => true, execute: () => { hooks.onFocusStarted?.(); return { summary: 'Sessão de foco iniciada' }; } });
  return registry;
}

const match = (message: string, expression: RegExp) => message.match(expression)?.[1]?.trim();
function localProposal(request: AiProviderRequest): AiProviderProposal {
  const message = request.message.trim(); const lower = message.toLocaleLowerCase('pt-BR'); let toolCalls: AiToolCall[] = [];
  const task = match(message, /^(?:crie|criar|adicione|adicionar)\s+(?:uma?\s+)?tarefa\s*:?[\s-]*(.+)$/i);
  const note = match(message, /^(?:crie|criar|adicione|adicionar)\s+(?:uma?\s+)?nota\s*:?[\s-]*(.+)$/i);
  const block = message.match(/^(?:crie|criar|adicione|adicionar)\s+(?:um\s+)?bloco\s*:?[\s-]*(.+?)\s+(?:das?\s+)?(\d{1,2}:\d{2})\s+(?:às?|a)\s+(\d{1,2}:\d{2})$/i);
  const reminder = message.match(/^(?:crie|criar|adicione|adicionar)\s+(?:um\s+)?lembrete\s*:?[\s-]*(.+?)(?:\s+às?\s+(\d{1,2}:\d{2}))?$/i);
  if (task) toolCalls = [{ name: 'task.create', arguments: { title: task, durationMinutes: 60 } }];
  else if (note) toolCalls = [{ name: 'note.create', arguments: { title: note, content: note } }];
  else if (block) toolCalls = [{ name: 'block.create', arguments: { title: block[1].trim(), start: `${request.currentTime.slice(0, 10)}T${block[2].padStart(5, '0')}:00-03:00`, end: `${request.currentTime.slice(0, 10)}T${block[3].padStart(5, '0')}:00-03:00`, category: 'work' } }];
  else if (reminder) { const time = reminder[2] ?? request.currentTime.slice(11, 16); toolCalls = [{ name: 'reminder.create', arguments: { title: reminder[1].trim(), at: `${request.currentTime.slice(0, 10)}T${time}:00-03:00` } }]; }
  else if (/^(iniciar|começar|comecar|start).*(foco|focus)/i.test(message)) toolCalls = [{ name: 'focus.start', arguments: {} }];
  else if (/(agenda|calend|hor.rio|schedule|today|hoje)/u.test(lower)) toolCalls = [{ name: 'search.schedule', arguments: {} }];
  else if (/(lembrete|remind)/u.test(lower)) toolCalls = [{ name: 'search.reminders', arguments: {} }];
  else if (/(taref|task|pend.ncia|todo)/u.test(lower)) toolCalls = [{ name: 'search.tasks', arguments: {} }];
  const reply = toolCalls.length ? 'Preparei uma ação local para sua revisão.' : 'Posso ajudar com tarefas, agenda, lembretes, notas e foco locais.';
  return { reply, toolCalls, notchPresentation: null, providerMetadata: { model: 'local-tool-provider' } };
}

export class LocalToolProvider implements AiProvider { readonly id = 'local-tools'; readonly label = 'Hibi local tools'; async generate(request: AiProviderRequest, signal: AbortSignal): Promise<AiProviderProposal> { if (signal.aborted) throw new DOMException('The AI turn was cancelled.', 'AbortError'); return localProposal(request); } }

export function createLocalHibiRuntime(repository: LocalRepository, hooks: Hooks = {}, provider: AiProvider = new LocalToolProvider()): AiTurnRuntime {
  const registry = createLocalToolRegistry(repository, hooks);
  return new AiTurnRuntime({ registry, policy: new AiToolPolicy(registry), provider, context: { get tasks() { return repository.listTasks().map((task) => ({ id: task.id, title: task.title, dueAt: task.deadline })); }, get reminders() { return repository.listReminders().map((reminder) => ({ id: reminder.id, title: reminder.title, nextAt: reminder.schedule.at })); }, get schedule() { return repository.listBlocks(); } } });
}

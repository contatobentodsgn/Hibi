import React, { useMemo, useRef, useState } from 'react';
import { LocalRepository } from './data/local-repository';
import type { WorkspacePreferences } from './data/workspace-backup';
import { createSeedData } from './data/seed-data';
import type { EntityStatus, Goal, Habit, ScheduleBlock, StudyData } from './domain/models';
import { validateScheduleBlock } from './domain/conflicts';
import { AppShell } from './ui/shell/AppShell';
import type { NavKey } from './ui/shell/routes';
import { AgendaView } from './ui/AgendaView';
import { CommandPalette } from './ui/palette/CommandPalette';
import { HomeView } from './ui/HomeView';
import { TasksView } from './ui/TasksView';
import { RemindersView, type EditedReminderSchedule } from './ui/RemindersView';
import { FocusView } from './ui/FocusView';
import { SettingsView } from './ui/SettingsView';
import { InstrumentationView } from './ui/InstrumentationView';
import { NotesView } from './ui/NotesView';
import { buildNotificationEntries } from './domain/notifications';
import { HabitsView } from './ui/HabitsView';
import { GoalsView } from './ui/GoalsView';
import { ReviewView } from './ui/ReviewView';
import { TabyView } from './ui/TabyView';
import { HelpView } from './ui/HelpView';
import { FeedbackView } from './ui/FeedbackView';
import { AvailabilityView } from './ui/AvailabilityView';
import { firstWeeklyOccurrence } from './domain/recurrence';
import { TaskCreateModal, type NewTaskForm } from './ui/TaskCreateModal';
import { ReminderCreateModal, type NewReminderForm } from './ui/ReminderCreateModal';
import { DeadlineEditModal } from './ui/DeadlineEditModal';
import { createLocalHibiRuntime, LocalToolProvider } from './ai/local-runtime';
import { ElectronConfiguredProvider } from './ai/electron-provider';
import { HeuristicAiProvider } from './ai/heuristic-provider';
import { CompanionController } from './companion/controller';
import type { CompanionEvent } from './companion/contracts';
import { appendAiAuditEvent, appendAiUsageRecord, loadAiAuditHistory, loadAiUsageLedger, type AiAuditEvent, type AiUsageRecord } from './ai/history';
import type { AiFallbackPolicy } from './ai/contracts';
import { applyImportDecision, type ImportCandidate, type ImportDecision } from './integrations/imports';
import { localApiTaskMutation, type LocalApiIntent } from './integrations/local-api-intents';
import { useAssistantTurn } from './ui/useAssistantTurn';
import { applyNotionMutations, type NotionLocalMutation } from './integrations/notion-apply';
import { listFolders, NO_FOLDER, planFolderRename, renameApplied, type FolderRenamePlan } from './domain/folders';

export type EventRecord = { id: number; at: string; route: string; action: string; detail: string; result?: string };
const AI_FALLBACK_POLICY_STORAGE_KEY = 'hibi-ai-fallback-policy';
const AI_USAGE_LEDGER_STORAGE_KEY = 'hibi-ai-usage-ledger';
const readAiFallbackPolicy = (): AiFallbackPolicy => {
  try { const saved = window.localStorage.getItem(AI_FALLBACK_POLICY_STORAGE_KEY); return saved === 'ask' || saved === 'automatic' || saved === 'never' ? saved : 'automatic'; } catch { return 'automatic'; }
};
const readAiUsageLedger = (): AiUsageRecord[] => {
  try { return loadAiUsageLedger(window.localStorage.getItem(AI_USAGE_LEDGER_STORAGE_KEY)); } catch { return []; }
};

const initialEvents: EventRecord[] = [
  { id: 1, at: '09:02:14', route: 'week', action: 'navigation', detail: 'Opened weekly schedule' },
  { id: 2, at: '09:03:01', route: 'week', action: 'validation', detail: 'Checked 8 schedule blocks', result: 'pass' },
  { id: 3, at: '09:04:22', route: 'reminders', action: 'edit', detail: 'Horizontes recurrence preview', result: 'pending' },
];

export default function App() {
  const [repository] = useState(() => {
    const seed = createSeedData();
    try { const saved = window.localStorage.getItem('hibi-study-data'); return saved ? LocalRepository.fromJson(seed, saved) : new LocalRepository(seed); } catch { return new LocalRepository(seed); }
  });
  const [data, setData] = useState<StudyData>(() => repository.snapshot());
  const [route, setRoute] = useState<NavKey>('home');
  // Filtro de pasta pedido junto com a navegação. O `nonce` muda a cada navegação e vira `key` das
  // telas, então o filtro pedido é reaplicado mesmo quando se volta à mesma tela.
  const [folderFilter, setFolderFilter] = useState<{ folder: string | null; nonce: number }>({ folder: null, nonce: 0 });
  const companionController = useRef<CompanionController | null>(null);
  if (!companionController.current) companionController.current = new CompanionController({ show: (presentation) => { void window.hibiDesktop?.showNotch?.(presentation); }, hide: (requestId) => { void window.hibiDesktop?.hideNotch?.(requestId); } });
  const dispatchCompanion = (event: CompanionEvent) => companionController.current!.dispatch(event);
  const companionId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
  const [aiHistory, setAiHistory] = useState<AiAuditEvent[]>(() => loadAiAuditHistory(window.localStorage.getItem('hibi-ai-history')));
  const [aiUsage, setAiUsage] = useState<AiUsageRecord[]>(readAiUsageLedger);
  const [aiFallbackPolicy, setAiFallbackPolicy] = useState<AiFallbackPolicy>(readAiFallbackPolicy);
  const aiFallbackPolicyRef = useRef(aiFallbackPolicy);
  const updateAiFallbackPolicy = (policy: AiFallbackPolicy) => { aiFallbackPolicyRef.current = policy; setAiFallbackPolicy(policy); try { window.localStorage.setItem(AI_FALLBACK_POLICY_STORAGE_KEY, policy); } catch { /* unavailable storage */ } };
  const [aiRuntime] = useState(() => { const hooks = { onDataChanged: () => setData(repository.snapshot()), onTaskCompleted: (title: string) => dispatchCompanion({ type: 'task.completed', requestId: companionId('task'), text: `Tarefa concluída: ${title}`, nowMs: Date.now(), expiresInMs: 3_000 }), onFocusStarted: () => { setRoute('focus'); dispatchCompanion({ type: 'focus.started', requestId: companionId('focus'), text: 'Sessão de foco iniciada', nowMs: Date.now(), expiresInMs: 3_000 }); }, onAudit: (event: AiAuditEvent) => setAiHistory((current) => appendAiAuditEvent(current, event)), onUsage: (event: { at: string; provider: string; model: string; usage: { inputTokens: number; outputTokens: number; totalTokens: number }; outcome: 'completed'; fallback: boolean }) => setAiUsage((current) => appendAiUsageRecord(current, event)), ...(window.hibiDesktop?.prepareIntegrationAction && window.hibiDesktop?.executeApprovedIntegrationAction ? { integrations: { prepare: (input: { connectorId: string; kind: string; payload: Record<string, unknown> }) => window.hibiDesktop!.prepareIntegrationAction!(input), executeApproved: (input: { actionId: string; confirmationId: string }) => window.hibiDesktop!.executeApprovedIntegrationAction!(input) as Promise<{ ok: boolean; remoteId?: string }> } } : {}) }; return createLocalHibiRuntime(repository, hooks, new ElectronConfiguredProvider(window.hibiDesktop ?? {}, new LocalToolProvider(repository)), new HeuristicAiProvider(), () => aiFallbackPolicyRef.current); });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [taskCreateOpen, setTaskCreateOpen] = useState(false);
  const [reminderCreateOpen, setReminderCreateOpen] = useState(false);
  const [deadlineEditTaskId, setDeadlineEditTaskId] = useState<string | null>(null);
  const [validationError, setValidationError] = useState('');
  const [pendingLocalApiIntent, setPendingLocalApiIntent] = useState<LocalApiIntent | null>(null);
  const [events, setEvents] = useState<EventRecord[]>(() => { try { const saved = window.localStorage.getItem('hibi-events'); return saved ? JSON.parse(saved) as EventRecord[] : initialEvents; } catch { return initialEvents; } });
  const clearEvents = () => setEvents([]);
  const clearAiHistory = () => setAiHistory([]);

  const log = (action: string, detail: string, result?: string) => {
    setEvents((current) => [{ id: Math.max(0, ...current.map((event) => event.id)) + 1, at: new Date().toLocaleTimeString('pt-BR'), route, action, detail, result }, ...current]);
  };

  const assistantTurn = useAssistantTurn({ runtime: aiRuntime, data, onEvent: log, onCompanionEvent: dispatchCompanion, onCompanionError: (text) => dispatchCompanion({ type: 'error.raised', requestId: companionId('error'), text, nowMs: Date.now(), expiresInMs: 5_000 }) });

  const refreshData = () => setData(repository.snapshot());
  const planStartDate = () => repository.listBlocks().map((block) => block.start.slice(0, 10)).filter(Boolean).sort()[0] ?? new Date().toISOString().slice(0, 10);

  const changeTaskStatus = (id: string, status: EntityStatus) => {
    const task = repository.getTask(id);
    if (!task) return;
    repository.updateTask(id, { status });
    refreshData();
    log(status === 'completed' ? 'complete' : 'reopen', task.title, status);
    if (status === 'completed') dispatchCompanion({ type: 'task.completed', requestId: companionId('task'), text: `Tarefa concluída: ${task.title}`, nowMs: Date.now(), expiresInMs: 3_000 });
  };

  const changeReminderStatus = (id: string, status: EntityStatus) => {
    const reminder = data.reminders.find((item) => item.id === id);
    if (!reminder) return;
    repository.updateReminder(id, { status });
    refreshData();
    log(status === 'paused' ? 'pause' : 'resume', reminder.title, status);
  };

  const createBlock = (input: Omit<ScheduleBlock, 'id'>) => {
    const validation = validateScheduleBlock({ ...input, id: `preview-${Date.now()}` }, repository.listBlocks());
    if (!validation.valid) { const text = validation.errors.join('\n'); setValidationError(text); log('validation', input.title, 'blocked'); dispatchCompanion({ type: 'error.raised', requestId: companionId('error'), text, nowMs: Date.now(), expiresInMs: 5_000 }); return; }
    setValidationError('');
    repository.createBlock(input);
    refreshData();
    log('create', input.title);
  };
  const deleteBlock = (id: string) => { const block = data.blocks.find((item) => item.id === id); if (!block) return; if (!window.confirm(`Excluir ${block.title}?`)) return; repository.deleteBlock(id); refreshData(); log('delete', block.title); };
  const createTask = ({ title, durationMinutes, folder }: NewTaskForm) => { repository.createTask({ title, durationMinutes, category: 'work', folder, status: 'open' }); refreshData(); log('create', title); setTaskCreateOpen(false); };
  const createReminder = ({ title, category, date, frequency, time, weekdays }: NewReminderForm) => {
    if (frequency === 'one-time') repository.createReminder({ title, category, status: 'open', schedule: { at: `${date}T${time}:00-03:00` } });
    if (frequency === 'daily') repository.createReminder({ title, category, status: 'open', schedule: { at: `${date}T${time}:00-03:00`, recurrence: { frequency: 'daily', time, startDate: date } } });
    if (frequency === 'weekly') {
      const parts = weekdays.map((day) => `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day]} ${time}`);
      const first = firstWeeklyOccurrence(date, parts)!;
      repository.createReminder({ title, category, status: 'open', schedule: { at: `${first.date}T${first.time}:00-03:00`, recurrence: { frequency: 'weekly', weekdays, timesByWeekday: Object.fromEntries(weekdays.map((day) => [day, time])), startDate: date } } });
    }
    refreshData(); log('create', title); setReminderCreateOpen(false);
  };
  const renameTask = (id: string, title: string) => { repository.updateTask(id, { title }); refreshData(); log('edit', title); };
  const renameReminder = (id: string, title: string) => { repository.updateReminder(id, { title }); refreshData(); log('edit', title); };
  const deleteTask = (id: string) => { repository.deleteTask(id); refreshData(); log('delete', id); };
  const deleteReminder = (id: string) => { repository.deleteReminder(id); refreshData(); log('delete', id); };
  const createNote = (title: string, content: string, folder: string) => { repository.createNote({ title, content, folder, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); refreshData(); log('create', title); };
  const updateNote = (id: string, changes: Partial<import('./domain/models').Note>) => { repository.updateNote(id, changes); refreshData(); log('edit', id); };
  const deleteNote = (id: string) => { repository.deleteNote(id); refreshData(); log('delete', id); };
  // Revalida contra o estado atual do repositório: a paleta pode ter planejado sobre um snapshot
  // anterior. Também recusa quando a expectativa de junção da paleta não bate mais com o plano atual
  // (a pasta de destino surgiu ou sumiu no meio) — nesses casos nada é aplicado.
  const renameFolder = (from: string, to: string, expectMerge: boolean): FolderRenamePlan => {
    const plan = planFolderRename(repository.snapshot(), from, to);
    if (plan.ok && renameApplied(plan, expectMerge)) {
      repository.renameFolder(plan.from, plan.to);
      refreshData();
      log('edit', `Folder · ${plan.from} → ${plan.to}`, plan.merge ? 'merged' : 'renamed');
    }
    return plan;
  };
  const submitFeedback = (kind: string, text: string) => { repository.createNote({ title: `[${kind}] Feedback`, content: text, folder: 'Bento', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); refreshData(); log('feedback', kind, 'saved-local'); };
  const createHabit = (title: string, frequency: Habit['frequency'] = 'daily', targetPerWeek = 7) => { repository.createHabit({ title, frequency, targetPerWeek, completedDates: [], status: 'open' }); refreshData(); log('create', title); };
  const updateHabit = (id: string, changes: Partial<Omit<Habit, 'id'>>) => { repository.updateHabit(id, changes); refreshData(); log('edit', id); };
  const deleteHabit = (id: string) => { repository.deleteHabit(id); refreshData(); log('delete', id); };
  const toggleHabitCompletion = (id: string, date: string, completed: boolean) => { repository.setHabitCompletion(id, date, completed); refreshData(); log(completed ? 'complete' : 'reopen', id, date); };
  const createGoal = (title: string, target: number, unit?: string) => { repository.createGoal({ title, target, current: 0, unit, status: 'open' }); refreshData(); log('create', title); };
  const updateGoal = (id: string, changes: Partial<Omit<Goal, 'id'>>) => { repository.updateGoal(id, changes); refreshData(); log('edit', id); };
  const deleteGoal = (id: string) => { repository.deleteGoal(id); refreshData(); log('delete', id); };
  const setGoalProgress = (id: string, current: number) => { repository.setGoalProgress(id, current); refreshData(); log('progress', id, String(current)); };
  const editTaskDeadline = (id: string) => { if (data.tasks.some((task) => task.id === id)) setDeadlineEditTaskId(id); };
  const saveTaskDeadline = (id: string, deadline?: string) => { const task = data.tasks.find((item) => item.id === id); if (!task) return; repository.updateTask(id, { deadline }); refreshData(); log('edit', task.title, 'deadline-updated'); setDeadlineEditTaskId(null); };
  const editReminderSchedule = (id: string, edited: EditedReminderSchedule) => {
    const reminder = data.reminders.find((item) => item.id === id); if (!reminder) return;
    if (edited.frequency === 'one-time') repository.updateReminder(id, { schedule: { at: `${edited.date}T${edited.time}:00-03:00` } });
    if (edited.frequency === 'daily') repository.updateReminder(id, { schedule: { at: `${edited.date}T${edited.time}:00-03:00`, recurrence: { frequency: 'daily', time: edited.time, startDate: edited.date } } });
    if (edited.frequency === 'weekly') {
      const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const parts = edited.weekdays.map((day) => `${labels[day]} ${edited.time}`);
      const first = firstWeeklyOccurrence(edited.date, parts)!;
      const timesByWeekday: Record<number, string> = Object.fromEntries(edited.weekdays.map((day) => [day, edited.time]));
      repository.updateReminder(id, { schedule: { at: `${first.date}T${first.time}:00-03:00`, recurrence: { frequency: 'weekly', weekdays: edited.weekdays, timesByWeekday, startDate: edited.date } } });
    }
    refreshData(); log('edit', reminder.title, 'schedule-updated');
  };

  const resetStudyData = () => {
    if (!window.confirm('Reset all local study data?')) return;
    repository.reset();
    refreshData();
    log('reset', 'Reset study data', 'pass');
  };

  const restoreStudyData = (restored: StudyData, preferences: WorkspacePreferences) => {
    repository.replace(restored);
    refreshData();
    log('import', `Restored ${restored.tasks.length} tasks, ${restored.blocks.length} calendar blocks`, `${preferences.language} · ${preferences.twentyFourHour ? '24h' : '12h'}`);
  };
  const applyImportedTask = (candidate: ImportCandidate, decision: ImportDecision, localId?: string, connectorId = 'file-import') => {
    const local = localId ? data.tasks.find((task) => task.id === localId) : undefined;
    const mutation = applyImportDecision(local, candidate, decision, connectorId);
    if (mutation.type === 'update') repository.updateTask(mutation.localId, { title: mutation.title, remoteRef: mutation.remoteRef });
    if (mutation.type === 'create') repository.createTask({ title: mutation.title, durationMinutes: 60, category: 'work', folder: 'Bento', status: 'open', remoteRef: mutation.remoteRef });
    if (mutation.type !== 'none') refreshData();
    log('import', `${connectorId} · ${decision}: ${candidate.title}`, mutation.type);
  };
  const applyNotionSync = (mutations: readonly NotionLocalMutation[]) => {
    const tasks = applyNotionMutations(repository, mutations);
    refreshData();
    log('notion-sync', `${mutations.length} local changes`, 'applied');
    return tasks;
  };
  const resolveLocalApiIntent = async (approved: boolean) => {
    const intent = pendingLocalApiIntent;
    if (!intent) return;
    setPendingLocalApiIntent(null);
    if (approved) {
      const mutation = localApiTaskMutation(intent);
      if (mutation) { repository.createTask(mutation); refreshData(); log('local-api', mutation.title, 'approved'); }
    }
    await window.hibiDesktop?.resolveLocalApiWrite?.({ confirmationId: intent.confirmationId, approved });
  };

  const testNativeNotification = async () => {
    const shown = await window.hibiDesktop?.showTestNotification?.();
    return shown ?? false;
  };

  React.useEffect(() => { window.localStorage.setItem('hibi-study-data', repository.exportJson()); }, [repository, data]);
  React.useEffect(() => { window.localStorage.setItem('hibi-events', JSON.stringify(events)); }, [events]);
  React.useEffect(() => { try { window.localStorage.setItem('hibi-ai-history', JSON.stringify(loadAiAuditHistory(JSON.stringify(aiHistory)))); } catch { /* unavailable storage */ } }, [aiHistory]);
  React.useEffect(() => { try { window.localStorage.setItem(AI_USAGE_LEDGER_STORAGE_KEY, JSON.stringify(loadAiUsageLedger(JSON.stringify(aiUsage)))); } catch { /* unavailable storage */ } }, [aiUsage]);
  React.useEffect(() => { void window.hibiDesktop?.syncLocalApiWorkspace?.({ tasks: data.tasks, reminders: data.reminders, blocks: data.blocks }); }, [data]);
  React.useEffect(() => {
    const syncNotifications = window.hibiDesktop?.syncNotifications;
    if (syncNotifications) void syncNotifications(buildNotificationEntries(data)).catch(() => undefined);
  }, [data]);
  React.useEffect(() => window.hibiDesktop?.onNotificationTriggered?.((entry) => {
    dispatchCompanion({ type: 'reminder.triggered', requestId: companionId('reminder'), text: entry.title, nowMs: Date.now(), expiresInMs: 7_000, animationId: entry.kind === 'deadline' ? 'warning_01' : undefined });
  }) ?? (() => undefined), []);
  React.useEffect(() => window.hibiDesktop?.onLocalApiConfirmation?.((intent) => { setPendingLocalApiIntent(intent); dispatchCompanion({ type: 'confirmation.requested', requestId: intent.confirmationId, text: `A API local quer criar: ${typeof intent.payload.title === 'string' ? intent.payload.title : 'uma tarefa'}`, nowMs: Date.now(), expiresInMs: 60_000, actions: [{ id: 'confirm', label: 'Confirmar' }, { id: 'cancel', label: 'Cancelar' }] }); }) ?? (() => undefined), []);
  React.useEffect(() => window.hibiDesktop?.onCompanionAction?.((action) => { if (action.requestId === pendingLocalApiIntent?.confirmationId) void resolveLocalApiIntent(action.actionId === 'confirm'); }) ?? (() => undefined), [pendingLocalApiIntent]);
  React.useEffect(() => {
    const interval = window.setInterval(() => dispatchCompanion({ type: 'time.elapsed', nowMs: Date.now() }), 1_000);
    return () => window.clearInterval(interval);
  }, []);
  // Um modal do App (task/reminder/deadline) tem seu próprio listener de Escape na window; se a
  // paleta também abrisse por cima dele, um único Escape chegaria aos dois e fecharia o modal junto,
  // descartando o que estava sendo digitado. Cada Escape deve afetar só a camada mais no topo — e
  // cada modal já cuida do seu próprio Escape — então aqui a regra é simplesmente não empilhar a
  // paleta sobre um modal aberto. Os três estados precisam vir de uma ref: o handler é registrado
  // uma vez (deps `[]`) para não reatar o listener a cada abertura/fechamento de modal, então uma
  // closure sem ref ficaria presa nos valores da montagem.
  const modalOpenRef = useRef(false);
  modalOpenRef.current = taskCreateOpen || reminderCreateOpen || deadlineEditTaskId !== null;
  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (modalOpenRef.current) return;
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setPaletteOpen(true); }
      else if (event.key === '/' && !typing) { event.preventDefault(); setPaletteOpen(true); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const navigate = (next: NavKey, source = 'navigation', options: { folder?: string } = {}) => {
    // Só remonta a tela quando a rota muda ou um filtro é pedido, para que clicar no item do dock
    // da tela atual nunca apague o que o usuário está digitando.
    setFolderFilter((current) => ({ folder: options.folder ?? null, nonce: next !== route || options.folder !== undefined ? current.nonce + 1 : current.nonce }));
    setRoute(next);
    log(source, options.folder === undefined ? `Opened ${next}` : `Opened ${next} · folder`);
  };

  const content = useMemo(() => {
    const props = { onEvent: log, onNavigate: navigate };
    switch (route) {
      case 'tasks': return <TasksView key={`tasks-${folderFilter.nonce}`} {...props} data={data} initialFolder={folderFilter.folder} onTaskStatusChange={changeTaskStatus} onCreateTask={() => undefined} onRenameTask={renameTask} onDeleteTask={deleteTask} onEditTaskDeadline={editTaskDeadline} />;
      case 'notes': return <NotesView key={`notes-${folderFilter.nonce}`} data={data} initialFolder={folderFilter.folder} onCreate={createNote} onUpdate={updateNote} onDelete={deleteNote} />;
      case 'reminders': return <RemindersView {...props} data={data} onReminderStatusChange={changeReminderStatus} onCreateReminder={() => setReminderCreateOpen(true)} onRenameReminder={renameReminder} onDeleteReminder={deleteReminder} onEditReminderSchedule={editReminderSchedule} />;
      case 'habits': return <HabitsView data={data} onCreate={createHabit} onToggleCompletion={toggleHabitCompletion} onUpdate={updateHabit} onDelete={deleteHabit} />;
      case 'goals': return <GoalsView data={data} onCreate={createGoal} onProgress={setGoalProgress} onUpdate={updateGoal} onDelete={deleteGoal} />;
      case 'review': return <ReviewView data={data} onNavigate={navigate} />;
      case 'taby': return <TabyView data={data} turn={assistantTurn} />;
      case 'help': return <HelpView onNavigate={navigate} />;
      case 'feedback': return <FeedbackView onSubmit={submitFeedback} />;
      case 'agenda': case 'day': case 'week': return <AgendaView {...props} data={data} mode={route === 'agenda' ? undefined : route} onCreateBlock={createBlock} onDeleteBlock={deleteBlock} onModeChange={(mode) => setRoute(mode)} />;
      case 'focus': case 'break': return <FocusView key={route} {...props} mode={route === 'break' ? 'break' : 'focus'} onModeChange={(next) => navigate(next)} onFocusStarted={() => dispatchCompanion({ type: 'focus.started', requestId: companionId('focus'), text: 'Sessão de foco iniciada', nowMs: Date.now(), expiresInMs: 3_000 })} onFocusCompleted={() => dispatchCompanion({ type: 'focus.completed', requestId: companionId('focus'), text: 'Sessão de foco concluída', nowMs: Date.now(), expiresInMs: 3_000 })} />;
      case 'settings': return <SettingsView {...props} data={data} onReset={resetStudyData} onRestore={restoreStudyData} onTestNotification={testNativeNotification} aiFallbackPolicy={aiFallbackPolicy} onAiFallbackPolicyChange={updateAiFallbackPolicy} aiUsage={aiUsage} onApplyImport={applyImportedTask} onApplyNotion={applyNotionSync} />;
      case 'instrumentation': return <InstrumentationView events={events} aiHistory={aiHistory} onEvent={log} onClear={clearEvents} onClearAiHistory={clearAiHistory} />;
      case 'updates': return <AvailabilityView kind="updates" onNavigate={navigate} />;
      case 'hardware': return <AvailabilityView kind="hardware" onNavigate={navigate} />;
      default: return <HomeView {...props} data={data} onOpenCommands={() => setPaletteOpen(true)} />;
    }
  }, [route, events, aiHistory, aiFallbackPolicy, aiUsage, data, assistantTurn.state, folderFilter]);

  return (
    <AppShell active={route} onNavigate={(key) => {
      // O dock marca Foco como atual durante a pausa; clicar nele não pode descartar a pausa em
      // andamento — clicar no item já atual nunca apaga o que o usuário está fazendo (ver navigate()).
      // Vale de propósito também para uma pausa parada (ainda não iniciada): a rota já é "break" e o
      // dock já mostra Foco como atual, então o clique em Foco continua sem efeito — "Voltar ao foco"
      // (dentro da própria tela) é o caminho de volta, não o item do dock.
      if (route === 'break' && key === 'focus') return;
      navigate(key);
    }} onOpenCommands={() => setPaletteOpen(true)}>
      {validationError && <div role="alert" aria-live="assertive" style={{ display: 'flex', alignItems: 'flex-start', gap: 12, margin: '0 0 16px', padding: '13px 16px', border: '1px solid #e2a992', borderRadius: 12, background: '#fff0eb', color: '#984418' }}><span aria-hidden="true" style={{ fontWeight: 900 }}>!</span><div style={{ flex: 1, whiteSpace: 'pre-line' }}>{validationError}</div><button type="button" className="outline" onClick={() => setValidationError('')} aria-label="Dismiss validation error" style={{ padding: '7px 10px' }}>Dismiss</button></div>}
      {pendingLocalApiIntent && <div role="alert" className="notice" style={{ marginBottom: 16 }}><div><strong>Confirmação da API local</strong><p>Deseja criar “{typeof pendingLocalApiIntent.payload.title === 'string' ? pendingLocalApiIntent.payload.title : 'esta tarefa'}”?</p></div><div style={{ display: 'flex', gap: 8 }}><button className="primary" onClick={() => void resolveLocalApiIntent(true)}>Confirmar</button><button className="outline" onClick={() => void resolveLocalApiIntent(false)}>Cancelar</button></div></div>}
      <div className="legacy-surface" onClickCapture={(event) => { const button = (event.target as HTMLElement).closest('button'); if (route === 'tasks' && button?.textContent?.trim() === '+ New task') { event.preventDefault(); event.stopPropagation(); setTaskCreateOpen(true); } if (route === 'reminders' && button?.textContent?.trim() === '+ New reminder') { event.preventDefault(); event.stopPropagation(); setReminderCreateOpen(true); } }}>{content}</div>
      {paletteOpen && <CommandPalette data={data} onClose={() => setPaletteOpen(false)} onNavigate={(next, options) => { setPaletteOpen(false); navigate(next, 'command', options); }} onEvent={log} onRenameFolder={renameFolder} turn={assistantTurn} />}
      {taskCreateOpen && <TaskCreateModal onClose={() => setTaskCreateOpen(false)} onSubmit={createTask} folders={listFolders(data).map((entry) => entry.name).filter((name) => name !== NO_FOLDER)} />}
      {reminderCreateOpen && <ReminderCreateModal defaultDate={planStartDate()} onClose={() => setReminderCreateOpen(false)} onSubmit={createReminder} />}
      {deadlineEditTaskId && (() => { const task = data.tasks.find((item) => item.id === deadlineEditTaskId); return task ? <DeadlineEditModal taskTitle={task.title} deadline={task.deadline} onClose={() => setDeadlineEditTaskId(null)} onSubmit={(deadline) => saveTaskDeadline(task.id, deadline)} /> : null; })()}
    </AppShell>
  );
}

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { LocalRepository } from './data/local-repository';
import { WORKSPACE_RESTORE_POINT_KEYS, createDesktopWorkspaceBackend, createWorkspaceSession, createWorkspaceStore } from './data/workspace-store';
import type { WorkspacePreferences } from './data/workspace-backup';
import { createSeedData } from './data/seed-data';
import type { EntityStatus, Goal, Habit, ScheduleBlock, StudyData, Task } from './domain/models';
import type { ActivityInput } from './domain/activity';
import { blockActivity, focusActivity, goalProgressActivities, habitCompletionActivity, taskStatusActivity } from './domain/activity-events';
import { todayKey } from './domain/date-context';
import { validateScheduleBlock } from './domain/conflicts';
import { AppShell } from './ui/shell/AppShell';
import type { NavKey } from './ui/shell/routes';
import { AgendaView } from './ui/AgendaView';
import { browserAgendaHost, readAgendaMode, writeAgendaMode, type AgendaMode } from './ui/agenda-storage';
import { AgendaScreen } from './ui/redesign/screens/AgendaScreen';
import { CommandPalette } from './ui/palette/CommandPalette';
import { TodayScreen } from './ui/redesign/screens/TodayScreen';
import { TasksScreen } from './ui/redesign/screens/TasksScreen';
import { RemindersView, type EditedReminderSchedule } from './ui/RemindersView';
import { RemindersScreen } from './ui/redesign/screens/RemindersScreen';
import { FocusView } from './ui/FocusView';
import { appendEventRecord, loadEventLog } from './ui/event-log';
import { useCalendarDay } from './ui/useCalendarDay';
import { FocusBackgroundNotice } from './ui/FocusBackgroundNotice';
import { deriveFocusMood, focusSessionsCompletedToday } from './ui/focus-mood';
import { SettingsScreen } from './ui/redesign/settings/SettingsScreen';
import { InstrumentationView } from './ui/InstrumentationView';
import { NotesView } from './ui/NotesView';
import { NotesScreen } from './ui/redesign/screens/NotesScreen';
import { buildNotificationEntries } from './domain/notifications';
import { browserFocusSettingsHost, readFocusSettings, writeFocusSettings, type FocusSettings } from './ui/focus-settings';
import { ReviewView } from './ui/ReviewView';
import { StatsScreen } from './ui/redesign/screens/StatsScreen';
import { TabyScreen } from './ui/redesign/screens/TabyScreen';
import { HabitsScreen } from './ui/redesign/screens/HabitsScreen';
import { GoalsScreen } from './ui/redesign/screens/GoalsScreen';
import { HelpView } from './ui/HelpView';
import { FeedbackView } from './ui/FeedbackView';
import { AvailabilityView } from './ui/AvailabilityView';
import { firstWeeklyOccurrence } from './domain/recurrence';
import { TaskCreateModal, type NewTaskForm } from './ui/TaskCreateModal';
import { ReminderCreateModal, type NewReminderForm } from './ui/ReminderCreateModal';
import { DeadlineEditModal } from './ui/DeadlineEditModal';
import { createLocalHibiRuntime, LocalToolProvider } from './ai/local-runtime';
import { ElectronConfiguredProvider } from './ai/electron-provider';
import { OfflineBrainProvider } from './ai/offline-brain-provider';
import { useTabyShortcut } from './ui/useTabyShortcut';
import { useVoiceTurn } from './ui/useVoiceTurn';
import { voiceVocabulary } from './ai/voice-vocabulary';
import { HeuristicAiProvider } from './ai/heuristic-provider';
import { CompanionController } from './companion/controller';
import type { CompanionEvent } from './companion/contracts';
import { appendAiAuditEvent, appendAiUsageRecord, loadAiAuditHistory, loadAiUsageLedger, type AiAuditEvent, type AiUsageRecord } from './ai/history';
import type { AiFallbackPolicy } from './ai/contracts';
import { applyImportDecision, type ImportCandidate, type ImportDecision } from './integrations/imports';
import { localApiTaskMutation, type LocalApiIntent } from './integrations/local-api-intents';
import { useAssistantTurn } from './ui/useAssistantTurn';
import { useConversations } from './ui/useConversations';
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
  // O workspace passa a viver no banco do processo principal quando a ponte existe; sem ela (no
  // navegador, nos testes e nas versões antigas do app) tudo segue no `localStorage`. A leitura do
  // banco é assíncrona, então a primeira pintura ainda vem do espelho local acima e só depois o que
  // está gravado assume. Até lá a sessão grava só no espelho local, porque mandar para o banco o que
  // está em memória antes de ler sobrescreveria o que está lá — que pode ser mais novo.
  const [workspace] = useState(() => createWorkspaceSession(createWorkspaceStore({ storage: window.localStorage, database: createDesktopWorkspaceBackend(window.hibiDesktop) })));
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const workspaceWarned = useRef(false);
  const [route, setRoute] = useState<NavKey>('home');
  const [agendaHost] = useState(browserAgendaHost);
  const [agendaMode, setAgendaMode] = useState<AgendaMode>(() => readAgendaMode(agendaHost.storage));
  // Muda à meia-noite e renderiza as telas de novo: "hoje" nelas é calculado ao renderizar.
  const calendarDay = useCalendarDay();
  const [focusStartPending, setFocusStartPending] = useState(false);
  // Uma sessão de foco iniciada (rodando ou pausada) sobrevive à troca de tela: com o app na barra de
  // menus a pessoa abre Tarefas no meio do foco o tempo todo, e desmontar a tela abandonava a sessão.
  const [focusActive, setFocusActive] = useState(false);
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
  // Uma ação confirmada do Taby registra como a tela: conclusões e reaberturas. O aviso só aparece na transição para concluída.
  // Uma reunião marcada pelo Taby vai também para o primeiro calendário bidirecional escolhido em
  // Ajustes › Integrations. A confirmação do Taby é a aprovação da pessoa para esta escrita.
  const publishMeetingToCalendar = async (block: ScheduleBlock): Promise<string | null> => {
    const bridge = window.hibiDesktop!;
    const state = await bridge.getCalendarSyncState!();
    const target = state.calendars.find((calendar) => calendar.mode === 'bidirectional');
    if (!target) return null;
    const action = await bridge.prepareCalendarPublish!({ calendarId: target.id, block: { id: block.id, title: block.title, startsAt: block.start, endsAt: block.end, allDay: false } });
    await bridge.executeApprovedCalendarPublish!({ actionId: action.id, confirmationId: action.confirmationId });
    return target.label;
  };
  // Mover pelo Taby uma reunião que já está no calendário muda o evento lá. Sem vínculo, nada sai daqui.
  const updateMeetingInCalendar = async (block: ScheduleBlock): Promise<string | null> => {
    const bridge = window.hibiDesktop!;
    const state = await bridge.getCalendarSyncState!();
    const target = state.calendars.find((calendar) => calendar.mode === 'bidirectional');
    if (!target || !bridge.prepareCalendarUpdate) return null;
    const action = await bridge.prepareCalendarUpdate({ calendarId: target.id, block: { id: block.id, title: block.title, startsAt: block.start, endsAt: block.end, allDay: false } }).catch((error: unknown) => {
      // Bloco que nunca foi ao calendário não tem o que atualizar; qualquer outra recusa é falha de verdade.
      if (error instanceof Error && /not linked/iu.test(error.message)) return null;
      throw error;
    });
    if (!action) return null;
    await bridge.executeApprovedCalendarPublish!({ actionId: action.id, confirmationId: action.confirmationId });
    return target.label;
  };
  const [aiRuntime] = useState(() => { const hooks = { onDataChanged: () => setData(repository.snapshot()), onTaskStatusChanged: (before: Task, after: Task) => { recordActivity(taskStatusActivity(before, after.status ?? 'open', new Date().toISOString())); if (before.status !== 'completed' && after.status === 'completed') dispatchCompanion({ type: 'task.completed', requestId: companionId('task'), text: `Tarefa concluída: ${after.title}`, nowMs: Date.now(), expiresInMs: 3_000 }); }, onBlockCreated: (block: ScheduleBlock) => recordActivity(blockActivity('created', block, new Date().toISOString())), onBlockDeleted: (block: ScheduleBlock) => recordActivity(blockActivity('deleted', block, new Date().toISOString())), onFocusStarted: () => { setFocusStartPending(true); setRoute('focus'); }, ...(window.hibiDesktop?.getCalendarSyncState && window.hibiDesktop?.prepareCalendarPublish && window.hibiDesktop?.executeApprovedCalendarPublish ? { calendar: { publish: publishMeetingToCalendar, update: updateMeetingInCalendar } } : {}), onAudit: (event: AiAuditEvent) => setAiHistory((current) => appendAiAuditEvent(current, event)), onUsage: (event: { at: string; provider: string; model: string; usage: { inputTokens: number; outputTokens: number; totalTokens: number }; outcome: 'completed'; fallback: boolean }) => setAiUsage((current) => appendAiUsageRecord(current, event)), ...(window.hibiDesktop?.prepareIntegrationAction && window.hibiDesktop?.executeApprovedIntegrationAction ? { integrations: { prepare: (input: { connectorId: string; kind: string; payload: Record<string, unknown> }) => window.hibiDesktop!.prepareIntegrationAction!(input), executeApproved: (input: { actionId: string; confirmationId: string }) => window.hibiDesktop!.executeApprovedIntegrationAction!(input) as Promise<{ ok: boolean; remoteId?: string }> } } : {}) }; return createLocalHibiRuntime(repository, hooks, new ElectronConfiguredProvider(window.hibiDesktop ?? {}, new OfflineBrainProvider(window.hibiDesktop ?? {}, new LocalToolProvider(repository))), new HeuristicAiProvider(), () => aiFallbackPolicyRef.current); });
  // Ajustes de Foco e a janela da sessão em andamento. Os dois existem aqui só para serem entregues ao
  // agendador junto das entradas: é lá, em electron/focus-gate.mjs, que a decisão de silenciar vale.
  const [focusSettingsHost] = useState(browserFocusSettingsHost);
  const [focusSettings, setFocusSettings] = useState<FocusSettings>(() => readFocusSettings(focusSettingsHost.storage));
  const updateFocusSettings = (next: FocusSettings) => { setFocusSettings(next); writeFocusSettings(focusSettingsHost.storage, next); };
  // O runtime do assistente é criado uma vez; o loop do companion que ele pede precisa do ajuste atual.
  const focusSettingsRef = useRef(focusSettings);
  focusSettingsRef.current = focusSettings;
  const [focusUntilMs, setFocusUntilMs] = useState<number | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [taskCreateOpen, setTaskCreateOpen] = useState(false);
  const [reminderCreateOpen, setReminderCreateOpen] = useState(false);
  const [deadlineEditTaskId, setDeadlineEditTaskId] = useState<string | null>(null);
  const [validationError, setValidationError] = useState('');
  const [pendingLocalApiIntent, setPendingLocalApiIntent] = useState<LocalApiIntent | null>(null);
  const [events, setEvents] = useState<EventRecord[]>(() => { try { return loadEventLog(window.localStorage.getItem('hibi-events'), initialEvents); } catch { return initialEvents; } });
  const clearEvents = () => setEvents([]);
  const clearAiHistory = () => setAiHistory([]);

  const log = (action: string, detail: string, result?: string) => {
    setEvents((current) => appendEventRecord(current, { at: new Date().toLocaleTimeString('pt-BR'), route, action, detail, result }));
  };

  const assistantTurn = useAssistantTurn({ runtime: aiRuntime, onEvent: log, onCompanionEvent: dispatchCompanion, onCompanionError: (text) => dispatchCompanion({ type: 'error.raised', requestId: companionId('error'), text, nowMs: Date.now(), expiresInMs: 5_000 }) });
  // Montado aqui, acima da tela Taby e da paleta: a paleta pergunta com a tela desmontada, e uma
  // thread que morasse dentro da tela perderia essas perguntas. Recebe o turno porque a resposta do
  // assistente é gravada uma vez só, deste lado.
  const conversations = useConversations({ turn: assistantTurn, onEvent: log });
  // A voz vive aqui, e não na tela Taby: o atalho pode ouvir com a janela escondida, e o notch mostra.
  const voice = useVoiceTurn({ ask: (text) => { conversations.record({ role: 'user', text, at: new Date().toISOString() }); void assistantTurn.ask(text); }, turnState: assistantTurn.state, onCompanionEvent: dispatchCompanion, vocabulary: () => voiceVocabulary(data) });
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  const refreshData = () => setData(repository.snapshot());
  // Chamado só depois da mutação aplicada. Se registrar falhar, a ação continua valendo: só avisa.
  const recordActivity = (inputs: ActivityInput | readonly ActivityInput[] | null) => {
    const list: readonly ActivityInput[] = inputs === null ? [] : 'type' in inputs ? [inputs] : inputs;
    if (list.length === 0) return;
    let type = 'unknown';
    try {
      for (const input of list) { type = input.type; repository.appendActivity(input); }
    } catch {
      log('activity', type, 'fail');
      setValidationError('Não foi possível registrar a atividade.');
    }
    refreshData();
  };
  // Data sugerida para um lembrete novo: o começo do plano guardado, se ainda está por vir, e senão hoje.
  // O bloco mais antigo guardado costuma estar no passado, e um lembrete único lá nunca tocaria.
  const planStartDate = () => { const start = repository.listBlocks().map((block) => block.start.slice(0, 10)).filter(Boolean).sort()[0]; const today = todayKey(); return start && start > today ? start : today; };

  // getTask/getHabit/getGoal devolvem o objeto vivo do repositório: o "antes" precisa ser copiado.
  const changeTaskStatus = (id: string, status: EntityStatus) => {
    const task = repository.getTask(id);
    if (!task) return;
    const before = { ...task };
    repository.updateTask(id, { status });
    refreshData();
    log(status === 'completed' ? 'complete' : 'reopen', task.title, status);
    // Concluir de novo uma tarefa já concluída não é uma nova conclusão.
    if (before.status !== 'completed' && status === 'completed') dispatchCompanion({ type: 'task.completed', requestId: companionId('task'), text: `Tarefa concluída: ${task.title}`, nowMs: Date.now(), expiresInMs: 3_000 });
    recordActivity(taskStatusActivity(before, status, new Date().toISOString()));
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
    const block = repository.createBlock(input);
    refreshData();
    log('create', input.title);
    recordActivity(blockActivity('created', block, new Date().toISOString()));
  };
  const deleteBlock = (id: string) => {
    const block = data.blocks.find((item) => item.id === id);
    if (!block) return;
    if (!window.confirm(`Excluir ${block.title}?`)) return;
    repository.deleteBlock(id);
    refreshData();
    log('delete', block.title);
    recordActivity(blockActivity('deleted', block, new Date().toISOString()));
  };
  // Trazer para o Hibi o horário de um evento movido no calendário: passa pela mesma validação de um bloco novo.
  const moveBlock = (id: string, start: string, end: string): boolean => {
    const current = repository.listBlocks().find((block) => block.id === id);
    if (!current) return false;
    const validation = validateScheduleBlock({ ...current, start, end }, repository.listBlocks());
    if (!validation.valid) { setValidationError(validation.errors.join('\n')); log('validation', current.title, 'blocked'); return false; }
    repository.updateBlock(id, { start, end });
    refreshData();
    log('edit', current.title, 'calendar-incoming');
    return true;
  };
  const createTask = ({ title, durationMinutes, folder }: NewTaskForm) => { repository.createTask({ title, durationMinutes, category: 'work', folder, status: 'open' }); refreshData(); log('create', title); setTaskCreateOpen(false); };
  const createReminder = ({ title, category, date, frequency, time, weekdays }: NewReminderForm) => {
    if (frequency === 'one-time') repository.createReminder({ title, category, status: 'open', schedule: { at: `${date}T${time}:00` } });
    if (frequency === 'daily') repository.createReminder({ title, category, status: 'open', schedule: { at: `${date}T${time}:00`, recurrence: { frequency: 'daily', time, startDate: date } } });
    if (frequency === 'weekly') {
      const parts = weekdays.map((day) => `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day]} ${time}`);
      const first = firstWeeklyOccurrence(date, parts)!;
      repository.createReminder({ title, category, status: 'open', schedule: { at: `${first.date}T${first.time}:00`, recurrence: { frequency: 'weekly', weekdays, timesByWeekday: Object.fromEntries(weekdays.map((day) => [day, time])), startDate: date } } });
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
  const toggleHabitCompletion = (id: string, date: string, completed: boolean) => {
    const habit = repository.getHabit(id);
    const before = habit && { ...habit, completedDates: [...habit.completedDates] };
    repository.setHabitCompletion(id, date, completed);
    refreshData();
    log(completed ? 'complete' : 'reopen', id, date);
    if (before) recordActivity(habitCompletionActivity(before, date, completed, new Date().toISOString()));
  };
  const createGoal = (title: string, target: number, unit?: string) => { repository.createGoal({ title, target, current: 0, unit, status: 'open' }); refreshData(); log('create', title); };
  const updateGoal = (id: string, changes: Partial<Omit<Goal, 'id'>>) => { repository.updateGoal(id, changes); refreshData(); log('edit', id); };
  const deleteGoal = (id: string) => { repository.deleteGoal(id); refreshData(); log('delete', id); };
  const setGoalProgress = (id: string, current: number) => {
    const goal = repository.getGoal(id);
    const before = goal && { ...goal };
    repository.setGoalProgress(id, current);
    refreshData();
    log('progress', id, String(current));
    const after = repository.getGoal(id);
    if (before && after) recordActivity(goalProgressActivities(before, after, new Date().toISOString()));
  };
  const editTaskDeadline = (id: string) => { if (data.tasks.some((task) => task.id === id)) setDeadlineEditTaskId(id); };
  const saveTaskDeadline = (id: string, deadline?: string) => { const task = data.tasks.find((item) => item.id === id); if (!task) return; repository.updateTask(id, { deadline }); refreshData(); log('edit', task.title, 'deadline-updated'); setDeadlineEditTaskId(null); };
  const editReminderSchedule = (id: string, edited: EditedReminderSchedule) => {
    const reminder = data.reminders.find((item) => item.id === id); if (!reminder) return;
    if (edited.frequency === 'one-time') repository.updateReminder(id, { schedule: { at: `${edited.date}T${edited.time}:00` } });
    if (edited.frequency === 'daily') repository.updateReminder(id, { schedule: { at: `${edited.date}T${edited.time}:00`, recurrence: { frequency: 'daily', time: edited.time, startDate: edited.date } } });
    if (edited.frequency === 'weekly') {
      const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const parts = edited.weekdays.map((day) => `${labels[day]} ${edited.time}`);
      const first = firstWeeklyOccurrence(edited.date, parts)!;
      const timesByWeekday: Record<number, string> = Object.fromEntries(edited.weekdays.map((day) => [day, edited.time]));
      repository.updateReminder(id, { schedule: { at: `${first.date}T${first.time}:00`, recurrence: { frequency: 'weekly', weekdays: edited.weekdays, timesByWeekday, startDate: edited.date } } });
    }
    refreshData(); log('edit', reminder.title, 'schedule-updated');
  };

  const resetStudyData = () => {
    if (!window.confirm('Reset all local study data?')) return;
    // O ponto guarda o estado de antes: sem ele, apagar tudo é uma ação sem volta.
    workspace.markRestorePoint(WORKSPACE_RESTORE_POINT_KEYS.beforeReset);
    repository.reset();
    refreshData();
    log('reset', 'Reset study data', 'pass');
  };

  const restoreStudyData = (restored: StudyData, preferences: WorkspacePreferences) => {
    // Restaurar um backup sobrescreve o workspace inteiro; o ponto é o caminho de volta.
    workspace.markRestorePoint(WORKSPACE_RESTORE_POINT_KEYS.beforeRestore);
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
    // Sem descartar a apresentação, o estado do companion guarda a confirmação até ela expirar e o
    // relógio a mostra de novo no notch, já respondida.
    dispatchCompanion({ type: 'presentation.dismissed', requestId: intent.confirmationId });
    // O processo principal decide primeiro: um pedido expirado ou já respondido não cria nada aqui.
    const outcome = await window.hibiDesktop?.resolveLocalApiWrite?.({ confirmationId: intent.confirmationId, approved });
    if (!approved) return;
    if (!outcome?.resolved) { log('local-api', 'confirmation expired', 'expired'); setValidationError('A confirmação da API local expirou. Peça de novo pelo app que enviou.'); return; }
    const mutation = localApiTaskMutation(intent);
    if (mutation) { repository.createTask(mutation); refreshData(); log('local-api', mutation.title, 'approved'); }
  };
  // O cartão da API local some com o prazo do pedido: depois disso o processo principal já não aceita a resposta.
  React.useEffect(() => {
    if (!pendingLocalApiIntent) return undefined;
    const timer = window.setTimeout(() => setPendingLocalApiIntent((current) => (current === pendingLocalApiIntent ? null : current)), 60_000);
    return () => window.clearTimeout(timer);
  }, [pendingLocalApiIntent]);

  const testNativeNotification = async () => {
    const shown = await window.hibiDesktop?.showTestNotification?.();
    return shown ?? false;
  };

  React.useEffect(() => {
    let cancelled = false;
    void workspace.start().then((loaded) => {
      if (cancelled) return;
      // Só o que veio do banco substitui o que está em memória: `local` já é exatamente o que o
      // `useState` acima leu, e um payload ilegível não pode derrubar a sessão em andamento.
      if (loaded.origin === 'database' && loaded.payload !== null) {
        try { repository.replace(JSON.parse(loaded.payload) as StudyData); refreshData(); } catch { log('storage', 'O workspace gravado no banco está ilegível; o app seguiu com o armazenamento local', 'fail'); }
      }
      if (loaded.migrated) log('storage', 'Workspace migrado do armazenamento local para o banco, com ponto de restauração', 'pass');
      if (loaded.degraded) { workspaceWarned.current = true; log('storage', `A leitura do banco falhou e o app abriu pelo armazenamento local: ${loaded.degraded}`, 'fail'); }
      setWorkspaceReady(true);
    });
    return () => { cancelled = true; };
  }, []);
  // `workspaceReady` está nas dependências para o primeiro envio ao banco sair assim que a leitura
  // termina; antes disso a gravação vai só para o espelho local, como era antes do banco existir.
  React.useEffect(() => {
    void workspace.save(repository.exportJson()).then((saved) => {
      if (!saved?.degraded || workspaceWarned.current) return;
      // Um aviso por sessão: o efeito corre a cada mudança, e repetir encheria a instrumentação.
      workspaceWarned.current = true;
      log('storage', `A gravação no banco falhou e ficou só no armazenamento local: ${saved.degraded}`, 'fail');
    });
  }, [workspaceReady, repository, data]);
  React.useEffect(() => { window.localStorage.setItem('hibi-events', JSON.stringify(events)); }, [events]);
  React.useEffect(() => { try { window.localStorage.setItem('hibi-ai-history', JSON.stringify(loadAiAuditHistory(JSON.stringify(aiHistory)))); } catch { /* unavailable storage */ } }, [aiHistory]);
  React.useEffect(() => { try { window.localStorage.setItem(AI_USAGE_LEDGER_STORAGE_KEY, JSON.stringify(loadAiUsageLedger(JSON.stringify(aiUsage)))); } catch { /* unavailable storage */ } }, [aiUsage]);
  React.useEffect(() => { void window.hibiDesktop?.syncLocalApiWorkspace?.({ tasks: data.tasks, reminders: data.reminders, blocks: data.blocks }); }, [data]);
  React.useEffect(() => {
    const syncNotifications = window.hibiDesktop?.syncNotifications;
    if (syncNotifications) void syncNotifications(buildNotificationEntries(data), { settings: focusSettings, focusUntilMs }).catch(() => undefined);
  }, [data, focusSettings, focusUntilMs]);
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
  // cada modal já cuida do seu próprio Escape — então a regra é não empilhar a paleta sobre um modal
  // aberto, em toda forma de abrir a paleta (atalho, dock, captura rápida da Home).
  const modalOpen = taskCreateOpen || reminderCreateOpen || deadlineEditTaskId !== null;
  const openPalette = useCallback(() => {
    const dialogOpen = document.querySelector('.hibi-action-dialog') !== null;
    if (!modalOpen && !dialogOpen) setPaletteOpen(true);
  }, [modalOpen]);
  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openPalette(); }
      else if (event.key === '/' && !typing) { event.preventDefault(); openPalette(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [openPalette]);

  const navigate = (next: NavKey, source = 'navigation', options: { folder?: string } = {}) => {
    // Só remonta a tela quando a rota muda ou um filtro é pedido, para que clicar no item do dock
    // da tela atual nunca apague o que o usuário está digitando.
    setFolderFilter((current) => ({ folder: options.folder ?? null, nonce: next !== route || options.folder !== undefined ? current.nonce + 1 : current.nonce }));
    setRoute(next === 'agenda' ? agendaMode : next);
    log(source, options.folder === undefined ? `Opened ${next}` : `Opened ${next} · folder`);
  };
  // A barra embaixo do notch: o texto enviado vira pedido, falar e parar vão para a voz, e fechar
  // dispensa o que ela mostrava (parando a escuta, se era ela).
  React.useEffect(() => {
    const bridge = window.hibiDesktop;
    const offs = [
      bridge?.onBarSubmit?.((text) => { conversations.record({ role: 'user', text, at: new Date().toISOString() }); void assistantTurn.ask(text); }),
      bridge?.onBarVoice?.((command) => { if (command === 'start') void voiceRef.current.start({ notch: true }); else void voiceRef.current.stop(); }),
      bridge?.onBarClosed?.((requestId) => { if (voiceRef.current.listening) void voiceRef.current.stop(); dispatchCompanion({ type: 'presentation.dismissed', requestId }); }),
    ];
    return () => { for (const off of offs) off?.(); };
  }, [conversations, assistantTurn.ask]);
  useTabyShortcut((request) => {
    // No modo notch a janela nem aparece: trocar de tela ali só mudaria o que a pessoa vê depois.
    if (!request?.background) navigate('taby', 'shortcut');
    if (request?.listen) void voice.start({ notch: request.background });
  });

  const content = useMemo(() => {
    const props = { onEvent: log, onNavigate: navigate };
    const focusView = (mode: 'focus' | 'break') => <FocusView key={mode} {...props} autoStart={focusStartPending} onAutoStarted={() => setFocusStartPending(false)} mode={mode} onModeChange={(next) => navigate(next)} sessionMinutes={focusSettings.sessionMinutes} awayBehavior={focusSettings.awayBehavior} idleMinutes={focusSettings.idleMinutes} focusLoopAnimation={focusSettings.focusLoopAnimation} activity={data.activity} presence={{ watch: window.hibiDesktop?.watchFocusPresence, subscribe: window.hibiDesktop?.onFocusPresence }} onCompanionEvent={dispatchCompanion} subscribeCompanionActions={window.hibiDesktop?.onCompanionAction} onFocusWindowChange={setFocusUntilMs} onFocusLifecycle={(event) => { if (mode === 'focus') setFocusActive(event.type === 'started' || event.type === 'resumed' || event.type === 'paused'); recordActivity(focusActivity(event.type, event.focusedMinutes, new Date().toISOString())); }} onFocusStarted={() => dispatchCompanion({ type: 'focus.started', requestId: companionId('focus'), text: 'Sessão de foco iniciada', nowMs: Date.now(), expiresInMs: 3_000, focusLoopAnimation: focusSettings.focusLoopAnimation, focusMood: deriveFocusMood({ awayPending: false, completedToday: focusSessionsCompletedToday(data.activity, new Date()) }) })} onFocusCompleted={() => dispatchCompanion({ type: 'focus.completed', requestId: companionId('focus'), text: 'Sessão de foco concluída', nowMs: Date.now(), expiresInMs: 3_000 })} />;
    // A tela de Foco fica montada, escondida, enquanto a sessão existir. A pausa de descanso continua
    // encerrando a sessão: ela é outra tela, e o botão só aparece com o relógio parado.
    const keepFocus = route === 'focus' || (focusActive && route !== 'break');
    const focusHost = keepFocus ? <div className="focus-host" style={{ display: route === 'focus' ? 'contents' : 'none' }}>{focusView('focus')}</div> : null;
    const screen = (() => { switch (route) {
      case 'tasks': return <TasksScreen key={`tasks-${folderFilter.nonce}`} {...props} data={data} initialFolder={folderFilter.folder} onTaskStatusChange={changeTaskStatus} onCreateTask={(title, folder) => createTask({ title, durationMinutes: 60, folder: folder ?? 'Bento' })} onRenameTask={renameTask} onDeleteTask={deleteTask} onEditTaskDeadline={editTaskDeadline} />;
      case 'notes': return <NotesScreen key={`notes-${folderFilter.nonce}`} data={data} initialFolder={folderFilter.folder} onCreate={createNote} onUpdate={updateNote} onDelete={deleteNote} />;
      case 'reminders': return <RemindersScreen {...props} data={data} onReminderStatusChange={changeReminderStatus} onCreateReminder={() => setReminderCreateOpen(true)} onRenameReminder={renameReminder} onDeleteReminder={deleteReminder} onEditReminderSchedule={editReminderSchedule} />;
      case 'habits': return <HabitsScreen data={data} onCreate={createHabit} onToggleCompletion={toggleHabitCompletion} onUpdate={updateHabit} onDelete={deleteHabit} />;
      case 'goals': return <GoalsScreen data={data} onCreate={createGoal} onProgress={setGoalProgress} onUpdate={updateGoal} onDelete={deleteGoal} />;
      case 'review': return <ReviewView data={data} onNavigate={navigate} onCreateBlock={createBlock} />;
      case 'stats': return <StatsScreen records={data.activity} referenceDate={new Date()} onEvent={log} />;
      case 'taby': return <TabyScreen data={data} turn={assistantTurn} conversations={conversations} voice={voice} />;
      case 'help': return <HelpView onNavigate={navigate} />;
      case 'feedback': return <FeedbackView onSubmit={submitFeedback} />;
      case 'agenda': case 'day': case 'week': return <AgendaScreen {...props} data={data} mode={route === 'week' ? 'week' : 'day'} onCreateBlock={createBlock} onDeleteBlock={deleteBlock} onMoveBlock={moveBlock} onModeChange={(mode) => { setAgendaMode(mode); writeAgendaMode(agendaHost.storage, mode); setRoute(mode); }} />;
      case 'focus': return null;
      case 'break': return focusView('break');
      case 'settings': return <SettingsScreen {...props} data={data} onReset={resetStudyData} onRestore={restoreStudyData} onTestNotification={testNativeNotification} aiFallbackPolicy={aiFallbackPolicy} onAiFallbackPolicyChange={updateAiFallbackPolicy} aiUsage={aiUsage} onApplyImport={applyImportedTask} onApplyNotion={applyNotionSync} onMoveBlock={moveBlock} focusSettings={focusSettings} onFocusSettingsChange={updateFocusSettings} />;
      case 'instrumentation': return <InstrumentationView events={events} aiHistory={aiHistory} onEvent={log} onClear={clearEvents} onClearAiHistory={clearAiHistory} />;
      case 'updates': return <AvailabilityView kind="updates" onNavigate={navigate} />;
      case 'hardware': return <AvailabilityView kind="hardware" onNavigate={navigate} />;
      default: return <TodayScreen data={data} onNavigate={navigate} onOpenCommands={openPalette} onCreateTask={() => setTaskCreateOpen(true)} />;
    } })();
    const banner = focusActive && route !== 'focus' && route !== 'break'
      ? <FocusBackgroundNotice onReturn={() => navigate('focus')} />
      : null;
    return <>{banner}{focusHost}{screen}</>;
  }, [route, calendarDay, focusActive, focusStartPending, events, aiHistory, aiFallbackPolicy, aiUsage, data, assistantTurn.state, conversations, voice.listening, voice.transcript, voice.notice, folderFilter, openPalette, focusSettings, agendaMode]);

  return (
    <AppShell active={route} onNavigate={(key) => {
      // O dock marca Foco como atual durante a pausa; clicar nele não pode descartar a pausa em
      // andamento — clicar no item já atual nunca apaga o que o usuário está fazendo (ver navigate()).
      // Vale de propósito também para uma pausa parada (ainda não iniciada): a rota já é "break" e o
      // dock já mostra Foco como atual, então o clique em Foco continua sem efeito — "Voltar ao foco"
      // (dentro da própria tela) é o caminho de volta, não o item do dock.
      if (route === 'break' && key === 'focus') return;
      navigate(key);
    }} onOpenCommands={openPalette}>
      {validationError && <div role="alert" aria-live="assertive" style={{ display: 'flex', alignItems: 'flex-start', gap: 12, margin: '0 0 16px', padding: '13px 16px', border: '1px solid #e2a992', borderRadius: 12, background: '#fff0eb', color: '#984418' }}><span aria-hidden="true" style={{ fontWeight: 900 }}>!</span><div style={{ flex: 1, whiteSpace: 'pre-line' }}>{validationError}</div><button type="button" className="outline" onClick={() => setValidationError('')} aria-label="Dismiss validation error" style={{ padding: '7px 10px' }}>Dismiss</button></div>}
      {pendingLocalApiIntent && <div role="alert" className="notice" style={{ marginBottom: 16 }}><div><strong>Confirmação da API local</strong><p>Deseja criar “{typeof pendingLocalApiIntent.payload.title === 'string' ? pendingLocalApiIntent.payload.title : 'esta tarefa'}”?</p></div><div style={{ display: 'flex', gap: 8 }}><button className="primary" onClick={() => void resolveLocalApiIntent(true)}>Confirmar</button><button className="outline" onClick={() => void resolveLocalApiIntent(false)}>Cancelar</button></div></div>}
      <div className={route === 'home' || route === 'tasks' || route === 'reminders' || route === 'agenda' || route === 'day' || route === 'week' || route === 'focus' || route === 'break' || route === 'notes' || route === 'taby' || route === 'habits' || route === 'goals' || route === 'stats' || route === 'settings' ? 'redesign-surface' : 'legacy-surface'} onClickCapture={(event) => { const button = (event.target as HTMLElement).closest('button'); if (route === 'tasks' && button?.textContent?.trim() === '+ New task') { event.preventDefault(); event.stopPropagation(); setTaskCreateOpen(true); } if (route === 'reminders' && button?.textContent?.trim() === '+ New reminder') { event.preventDefault(); event.stopPropagation(); setReminderCreateOpen(true); } }}>{content}</div>
      {paletteOpen && <CommandPalette data={data} onClose={() => setPaletteOpen(false)} onNavigate={(next, options) => { setPaletteOpen(false); navigate(next, 'command', options); }} onEvent={log} onRenameFolder={renameFolder} turn={assistantTurn} conversations={conversations} />}
      {taskCreateOpen && <TaskCreateModal onClose={() => setTaskCreateOpen(false)} onSubmit={createTask} folders={listFolders(data).map((entry) => entry.name).filter((name) => name !== NO_FOLDER)} />}
      {reminderCreateOpen && <ReminderCreateModal defaultDate={planStartDate()} onClose={() => setReminderCreateOpen(false)} onSubmit={createReminder} />}
      {deadlineEditTaskId && (() => { const task = data.tasks.find((item) => item.id === deadlineEditTaskId); return task ? <DeadlineEditModal taskTitle={task.title} deadline={task.deadline} onClose={() => setDeadlineEditTaskId(null)} onSubmit={(deadline) => saveTaskDeadline(task.id, deadline)} /> : null; })()}
    </AppShell>
  );
}

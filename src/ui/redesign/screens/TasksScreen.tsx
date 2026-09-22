import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Button, Card } from '@heroui/react';
import { CalendarClock, Check, CheckCheck, ChevronDown, Circle, Clock3, Folder, ListFilter, Pencil, Plus, Trash2 } from 'lucide-react';
import type { EntityStatus, StudyData, Task } from '../../../domain/models';
import { folderOf, listFolders, NO_FOLDER } from '../../../domain/folders';
import { deriveTaskRhythm, isOpen, type TaskDeadlineState } from '../../task-rhythm';
import { ActionDialog } from '../components/ActionDialog';
import { HibiEmptyState } from '../components/HibiEmptyState';
import { HibiTag, type HibiTagTone } from '../components/HibiTag';
import { HibiUiRoot } from '../components/HibiUiRoot';
import { SectionHeader } from '../components/SectionHeader';
import { useT } from '../../../i18n/LocaleProvider';
import { TaskDetailsPanel } from './TaskDetailsPanel';
import './tasks-screen.css';

type Props = Readonly<{
  data: StudyData;
  /** Recebido no App para a tela ser determinística em testes e perto da meia-noite. */
  today?: string;
  onEvent: (action: string, detail: string, result?: string) => void;
  onTaskStatusChange: (id: string, status: EntityStatus) => void;
  onCreateTask?: (title: string, folder: string | null) => void;
  onRenameTask?: (id: string, title: string) => void;
  onDeleteTask?: (id: string) => void;
  onEditTaskDeadline?: (id: string) => void;
  initialFolder?: string | null;
}>;

type Scope = 'open' | 'all';

const deadlineCopy = (state: TaskDeadlineState, deadline: string | undefined, t: (key: import('../../../i18n/dictionary').DictionaryKey) => string) => {
  if (!deadline) return t('tasks.deadline.none');
  const date = deadline.slice(0, 10).split('-').reverse().join('/');
  if (state === 'overdue') return t('tasks.deadline.overdue').replace('{date}', date);
  if (state === 'today') return t('tasks.deadline.today').replace('{time}', deadline.slice(11, 16));
  return t('tasks.deadline.scheduled').replace('{date}', date);
};

const deadlineTone = (state: TaskDeadlineState): HibiTagTone => state === 'overdue' ? 'peach' : state === 'today' ? 'lavender' : 'neutral';

const folderLabel = (folder: string | null, t: (key: import('../../../i18n/dictionary').DictionaryKey) => string) => folder === null ? t('tasks.allFolders') : folder || t('tasks.noFolder');

/** A lista de tarefas do redesenho (U07): a seleção abre os detalhes sem trocar de rota ou perder o filtro atual. */
export function TasksScreen({ data, today = new Date().toISOString().slice(0, 10), onEvent, onTaskStatusChange, onCreateTask, onRenameTask, onDeleteTask, onEditTaskDeadline, initialFolder = null }: Props) {
  const t = useT();
  const copy = (key: import('../../../i18n/dictionary').DictionaryKey, values: Record<string, string | number> = {}) => Object.entries(values).reduce((value, [name, replacement]) => value.replace(`{${name}}`, String(replacement)), t(key));
  const [folder, setFolder] = useState<string | null>(initialFolder);
  const [scope, setScope] = useState<Scope>('open');
  const [sortByDeadline, setSortByDeadline] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);

  const folders = listFolders(data);
  const activeFolder = folder !== null && folders.some((entry) => entry.name === folder) ? folder : null;
  const visibleFolders = folders.filter((entry) => entry.tasks > 0 || entry.name === activeFolder);
  const rhythm = deriveTaskRhythm(data.tasks, today);
  const visibleTasks = useMemo(() => [...data.tasks]
    // Ao concluir no painel, o item continua presente até o painel fechar. Sem isso, o filtro "Em aberto"
    // desmonta o Drawer antes de a pessoa poder conferir ou reabrir a tarefa que acabou de mudar.
    .filter((task) => (scope === 'all' || isOpen(task) || task.id === selectedId) && (activeFolder === null || folderOf(task) === activeFolder))
    .sort((left, right) => sortByDeadline
      ? (left.deadline ?? '9999').localeCompare(right.deadline ?? '9999') || left.title.localeCompare(right.title)
      : 0), [activeFolder, data.tasks, scope, sortByDeadline]);
  const selectedTask = selectedId ? data.tasks.find((task) => task.id === selectedId) ?? null : null;

  // Uma tarefa pode desaparecer pelo sync, filtro ou exclusão enquanto o painel está aberto. Não deixamos um
  // painel com dados antigos preso na tela.
  useEffect(() => {
    if (selectedId && !selectedTask) setSelectedId(null);
  }, [selectedId, selectedTask]);
  useEffect(() => { setEditingTitle(false); setDeleteOpen(false); }, [selectedId]);

  const openTaskCount = data.tasks.filter(isOpen).length;
  const chooseFolder = (next: string | null) => {
    setFolder(next);
    onEvent('filter', `Tarefas · Pasta · ${next === null ? 'todas' : next || 'sem pasta'}`);
  };
  const submitCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    onCreateTask?.(title, activeFolder);
    onEvent('create', `Tarefas · ${title}`);
    setNewTitle('');
    setCreateOpen(false);
  };
  const submitRename = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTask) return;
    const title = titleDraft.trim();
    if (title && title !== selectedTask.title) {
      onRenameTask?.(selectedTask.id, title);
      onEvent('rename', `Tarefas · ${selectedTask.title} → ${title}`);
    }
    setEditingTitle(false);
  };

  return (
    <HibiUiRoot className="tasks-screen">
      <SectionHeader
        title={t('tasks.title')}
        subtitle={`${openTaskCount} aberta${openTaskCount === 1 ? '' : 's'} · ${rhythm.overdue ? `${rhythm.overdue} atrasada${rhythm.overdue === 1 ? '' : 's'}` : 'Tudo no seu ritmo'}`}
        actions={<ActionDialog trigger={<Button variant="primary"><Plus size={17} aria-hidden="true" />{t('tasks.create')}</Button>} isOpen={createOpen} onOpenChange={setCreateOpen} title={t('tasks.nextStep')} description={copy('tasks.createdIn', { folder: folderLabel(activeFolder, t).toLowerCase() })}>
          <form className="tasks-screen__create-form" onSubmit={submitCreate}>
            <label htmlFor="task-title">{t('tasks.titleField')}</label>
            <input id="task-title" value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder={t('tasks.placeholder')} autoFocus />
            <div><Button type="button" variant="secondary" onPress={() => setCreateOpen(false)}>{t('tasks.cancel')}</Button><Button type="submit" variant="primary">{t('tasks.create')}</Button></div>
          </form>
        </ActionDialog>}
      />

      <div className="tasks-screen__layout">
        <aside className="tasks-screen__sidebar" aria-label={t('tasks.filters')}>
          <div className="tasks-screen__filter-group">
            <span className="tasks-screen__filter-heading"><ListFilter size={14} aria-hidden="true" />{t('tasks.view')}</span>
            <button type="button" data-active={scope === 'open'} onClick={() => { setScope('open'); onEvent('filter', 'Tarefas · Abertas'); }}><Circle size={15} aria-hidden="true" />{t('tasks.open')} <span>{openTaskCount}</span></button>
            <button type="button" data-active={scope === 'all'} onClick={() => { setScope('all'); onEvent('filter', 'Tarefas · Todas'); }}><CheckCheck size={15} aria-hidden="true" />{t('tasks.all')} <span>{data.tasks.length}</span></button>
          </div>
          <div className="tasks-screen__filter-group">
            <span className="tasks-screen__filter-heading"><Folder size={14} aria-hidden="true" />{t('tasks.folders')}</span>
            <button type="button" aria-label={`${t('tasks.folders')} · ${t('tasks.all')}`} aria-pressed={activeFolder === null} data-active={activeFolder === null} onClick={() => chooseFolder(null)}>{t('tasks.allFolders')}</button>
            {visibleFolders.map((entry) => <button key={entry.name || 'none'} type="button" aria-label={`${t('tasks.folders')} · ${entry.name || t('tasks.noFolder')} ${entry.tasks}`} aria-pressed={activeFolder === entry.name} data-active={activeFolder === entry.name} onClick={() => chooseFolder(entry.name)}>{entry.name || t('tasks.noFolder')} <span>{entry.tasks}</span></button>)}
          </div>
        </aside>

        <section className="tasks-screen__main" aria-labelledby="tasks-list-title">
          <div className="tasks-screen__list-header"><div><h2 id="tasks-list-title">{folderLabel(activeFolder, t)}</h2><p>{copy('tasks.count', { count: visibleTasks.length, suffix: visibleTasks.length === 1 ? '' : 's' })}</p></div><Button variant="tertiary" size="sm" onPress={() => { setSortByDeadline((current) => !current); onEvent('sort', 'Tarefas · Prazo'); }}><CalendarClock size={15} aria-hidden="true" />{sortByDeadline ? t('tasks.byCreation') : t('tasks.byDeadline')} <ChevronDown size={14} aria-hidden="true" /></Button></div>
          <Card className="tasks-screen__list-card list-card">
            {visibleTasks.length ? <ul className="tasks-screen__list">{visibleTasks.map((task) => {
              const completed = task.status === 'completed';
              const deadlineState = rhythm.deadlineStateById[task.id] ?? 'none';
              return <li className="task-row" key={task.id} data-deadline={deadlineState}>
                <button type="button" className="tasks-screen__check" aria-label={`${completed ? 'Reabrir' : 'Concluir'} ${task.title}`} data-completed={completed} onClick={() => { onTaskStatusChange(task.id, completed ? 'open' : 'completed'); onEvent(completed ? 'reopen' : 'complete', task.title); }}><Check size={14} aria-hidden="true" /></button>
                <TaskDetailsPanel
                  task={task}
                  trigger={<Button className="tasks-screen__task-trigger" variant="ghost" onPress={() => setSelectedId(task.id)}><span className="tasks-screen__task-copy"><strong>{task.title}</strong><span>{task.durationMinutes} min · {folderOf(task) || t('tasks.folder.none')}</span></span><HibiTag tone={deadlineTone(deadlineState)}>{deadlineCopy(deadlineState, task.deadline, t)}</HibiTag></Button>}
                  isOpen={selectedId === task.id}
                  onOpenChange={(open) => setSelectedId(open ? task.id : null)}
                  deadline={deadlineCopy(deadlineState, task.deadline, t)}
                  deadlineTone={deadlineTone(deadlineState)}
                ><TaskPanelActions task={task} editingTitle={editingTitle} titleDraft={titleDraft} deleteOpen={deleteOpen} onStartEdit={() => { setTitleDraft(task.title); setEditingTitle(true); }} onCancelEdit={() => setEditingTitle(false)} onTitleDraftChange={setTitleDraft} onRename={submitRename} onToggleStatus={() => { onTaskStatusChange(task.id, completed ? 'open' : 'completed'); onEvent(completed ? 'reopen' : 'complete', task.title); }} onEditDeadline={() => { setSelectedId(null); onEditTaskDeadline?.(task.id); }} onDeleteOpenChange={setDeleteOpen} onDelete={() => { onDeleteTask?.(task.id); onEvent('delete', task.title); setDeleteOpen(false); setSelectedId(null); }} /></TaskDetailsPanel>
              </li>;
            })}</ul> : <div className="tasks-screen__empty"><HibiEmptyState icon={CheckCheck} tone="mint" title={activeFolder !== null ? 'Nenhuma tarefa nesta pasta' : 'Nenhuma tarefa nesta visão'} description={scope === 'open' ? 'As concluídas ficam guardadas em “Todas”.' : 'Comece por uma tarefa pequena e bem definida.'} action={<Button variant="secondary" size="sm" onPress={() => setCreateOpen(true)}>{activeFolder !== null ? `Criar tarefa em ${folderLabel(activeFolder, t)}` : t('tasks.create')}</Button>} /></div>}
          </Card>
        </section>

        <Card className="tasks-screen__summary" aria-label={t('tasks.summary.aria')}><h2>{t('tasks.summary.title')}</h2><p>{t('tasks.summary.detail')}</p><div><span><strong>{rhythm.overdue}</strong>{t('tasks.overdue')}</span><span><strong>{rhythm.dueToday}</strong>{t('tasks.today')}</span><span><strong>{rhythm.withoutDeadline}</strong>{t('tasks.noDeadline')}</span></div>{rhythm.next ? <p className="tasks-screen__next"><Clock3 size={15} aria-hidden="true" /><span>{t('tasks.next')} <strong>{rhythm.next.title}</strong></span></p> : <p className="tasks-screen__next"><CheckCheck size={15} aria-hidden="true" />{t('tasks.upToDate')}</p>}</Card>
      </div>
    </HibiUiRoot>
  );
}

function TaskPanelActions({ task, editingTitle, titleDraft, deleteOpen, onStartEdit, onCancelEdit, onTitleDraftChange, onRename, onToggleStatus, onEditDeadline, onDeleteOpenChange, onDelete }: Readonly<{
  task: Task; editingTitle: boolean; titleDraft: string; deleteOpen: boolean; onStartEdit: () => void; onCancelEdit: () => void; onTitleDraftChange: (value: string) => void; onRename: (event: FormEvent<HTMLFormElement>) => void; onToggleStatus: () => void; onEditDeadline: () => void; onDeleteOpenChange: (open: boolean) => void; onDelete: () => void;
}>) {
  const t = useT();
  const completed = task.status === 'completed';
  return <>
    {editingTitle ? <form className="tasks-screen__edit-form" onSubmit={onRename}><label htmlFor={`task-title-${task.id}`}>{t('tasks.titleField.short')}</label><input id={`task-title-${task.id}`} value={titleDraft} onChange={(event) => onTitleDraftChange(event.target.value)} autoFocus /><div><Button type="button" variant="secondary" onPress={onCancelEdit}>{t('tasks.cancel')}</Button><Button type="submit" variant="primary">{t('habits.save')}</Button></div></form> : <Button variant="secondary" onPress={onStartEdit}><Pencil size={15} aria-hidden="true" />{t('tasks.editTitle')}</Button>}
    <Button variant="secondary" onPress={onEditDeadline}><CalendarClock size={15} aria-hidden="true" />{t('tasks.editDeadline')}</Button>
    <Button variant={completed ? 'secondary' : 'primary'} onPress={onToggleStatus}>{completed ? t('tasks.reopen') : t('tasks.complete')}</Button>
    <ActionDialog trigger={<Button variant="danger"><Trash2 size={15} aria-hidden="true" />{t('tasks.delete')}</Button>} isOpen={deleteOpen} onOpenChange={onDeleteOpenChange} title={t('tasks.deleteTitle')} description={t('tasks.deleteDescription').replace('{title}', task.title)}>
      <div className="tasks-screen__confirm-actions"><Button slot="close" variant="secondary">{t('tasks.cancel')}</Button><Button slot="close" variant="danger" onPress={onDelete}>{t('tasks.delete')}</Button></div>
    </ActionDialog>
  </>;
}

import React, { useState } from 'react';
import type { EntityStatus, StudyData } from '../domain/models';
import { folderOf, listFolders } from '../domain/folders';
import { useT } from '../i18n/LocaleProvider';

type Props = {
  data: StudyData;
  onEvent: (action: string, detail: string, result?: string) => void;
  onTaskStatusChange: (id: string, status: EntityStatus) => void;
  onCreateTask?: (title: string) => void;
  onRenameTask?: (id: string, title: string) => void;
  onDeleteTask?: (id: string) => void;
  onEditTaskDeadline?: (id: string) => void;
  // Filtro de pasta pedido pela navegação (ex.: /folder). `null` mostra todas; '' é "Sem pasta".
  initialFolder?: string | null;
};

export function TasksView({ data, onEvent, onTaskStatusChange, onCreateTask, onRenameTask, onDeleteTask, onEditTaskDeadline, initialFolder = null }: Props) {
  const t = useT();
  const [folder, setFolder] = useState<string | null>(initialFolder);
  const [scope, setScope] = useState<'open' | 'all'>('open');
  const [deadlineSort, setDeadlineSort] = useState(false);
  const [creating, setCreating] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);
  const openTasks = data.tasks.filter((task) => task.status !== 'completed' && task.status !== 'paused');
  const allFolders = listFolders(data);
  // Só cai para "Todas" quando a pasta pedida não existe em lugar nenhum (nem em tarefas, nem em
  // notas) — chip removido, ou initialFolder que nunca existiu. Uma pasta sem tarefas nesta tela
  // continua ativa, com um chip de contagem 0 (ver o filtro de visibleFolders logo abaixo).
  const activeFolder = folder !== null && allFolders.some((entry) => entry.name === folder) ? folder : null;
  const visibleFolders = allFolders.filter((entry) => entry.tasks > 0 || entry.name === activeFolder);
  const visibleTasks = [...data.tasks].filter((task) => (scope === 'all' || (task.status !== 'completed' && task.status !== 'paused')) && (activeFolder === null || folderOf(task) === activeFolder)).sort((a, b) => deadlineSort ? (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') : 0);
  const submitNewTask = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const title = newTitle.trim(); if (!title) return; onCreateTask?.(title); setNewTitle(''); setCreating(false); };
  const startEditing = (id: string, title: string) => { setEditingId(id); setEditTitle(title); };
  const submitRename = (event: React.FormEvent<HTMLFormElement>, id: string, currentTitle: string) => { event.preventDefault(); const title = editTitle.trim(); if (title && title !== currentTitle) onRenameTask?.(id, title); setEditingId(null); };

  return <View title="Tasks" meta={`${openTasks.length} open · local study data`} action={creating ? 'Cancel' : '+ New task'} onAction={() => { setCreating(!creating); setNewTitle(''); }}>
    {creating && <form className="quick-input" onSubmit={submitNewTask} aria-label="Create task"><label htmlFor="new-task-title">Task title</label><input id="new-task-title" aria-label="New task title" value={newTitle} onChange={(event) => setNewTitle(event.target.value)} autoFocus /><button className="primary" type="submit">Add task</button></form>}
    <div className="filter-row"><button className={`filter ${scope === 'open' ? 'active' : ''}`} onClick={() => { setScope('open'); onEvent('filter', 'Tasks · Open'); }}>Open {openTasks.length}</button><button className={`filter ${scope === 'all' ? 'active' : ''}`} onClick={() => { setScope('all'); onEvent('filter', 'Tasks · All'); }}>All {data.tasks.length}</button><button className={`filter ${activeFolder === null ? 'active' : ''}`} aria-pressed={activeFolder === null} onClick={() => setFolder(null)}>{`${t('folders.label')} · ${t('folders.all')}`}</button>{visibleFolders.map((entry) => <button key={`folder-${entry.name}`} className={`filter ${activeFolder === entry.name ? 'active' : ''}`} aria-pressed={activeFolder === entry.name} onClick={() => { setFolder(activeFolder === entry.name ? null : entry.name); onEvent('filter', `Tasks · Folder · ${entry.name || 'none'}`); }}>{`${t('folders.label')} · ${entry.name || t('folders.none')} ${entry.tasks}`}</button>)}<button className={`filter sort ${deadlineSort ? 'active' : ''}`} onClick={() => { setDeadlineSort(!deadlineSort); onEvent('sort', 'Tasks · Deadline'); }}>Deadline ↕</button></div>
    <section className="list-card">{visibleTasks.map((task) => {
      const completed = task.status === 'completed';
      const paused = task.status === 'paused';
      return <div className="task-row" key={task.id}>
        <button className={`check ${completed ? 'checked' : ''}`} aria-label={`${completed ? 'Reopen' : 'Complete'} ${task.title}`} onClick={() => { onTaskStatusChange(task.id, completed ? 'open' : 'completed'); onEvent(completed ? 'reopen' : 'complete', task.title); }}>{completed ? '✓' : ''}</button>
        {editingId === task.id ? <form onSubmit={(event) => submitRename(event, task.id, task.title)}><label htmlFor={`rename-${task.id}`}>Task title</label><input id={`rename-${task.id}`} aria-label={`Rename ${task.title}`} value={editTitle} onChange={(event) => setEditTitle(event.target.value)} autoFocus /><button className="primary" type="submit">Save</button><button className="outline" type="button" onClick={() => setEditingId(null)}>Cancel</button></form> : <div><strong>{task.title}</strong><span>{task.durationMinutes} min · {folderOf(task) || t('folders.none')} · {task.deadline ? `deadline ${task.deadline.replace('T', ' ')}` : 'sem deadline'} · {paused ? 'paused' : task.category}</span></div>}
        {folderOf(task) && <span className="tag orange">{folderOf(task)}</span>}
        {editingId !== task.id && <div className="heading-actions"><button className="more" aria-label={`Rename ${task.title}`} onClick={() => startEditing(task.id, task.title)}>Rename</button><button className="more" aria-label={`Set deadline for ${task.title}`} onClick={() => onEditTaskDeadline?.(task.id)}>Deadline</button><button className="more" aria-label={`Delete ${task.title}`} onClick={() => setPendingDelete({ id: task.id, title: task.title })}>Delete</button></div>}
      </div>;
    })}{!visibleTasks.length && <p className="empty">No tasks match these filters.</p>}</section>
    {pendingDelete && <DeleteConfirmation title={pendingDelete.title} onCancel={() => setPendingDelete(null)} onConfirm={() => { onDeleteTask?.(pendingDelete.id); setPendingDelete(null); }} />}
  </View>;
}

function DeleteConfirmation({ title, onCancel, onConfirm }: { title: string; onCancel: () => void; onConfirm: () => void }) {
  return <div className="overlay"><section className="palette" role="dialog" aria-modal="true" aria-labelledby="delete-confirm-title"><h2 id="delete-confirm-title">Delete {title}?</h2><p>This action cannot be undone.</p><button className="outline" type="button" onClick={onCancel} autoFocus>Cancel</button><button className="primary" type="button" onClick={onConfirm}>Confirm delete</button></section></div>;
}

function View({ title, meta, action, onAction, children }: { title: string; meta: string; action: string; onAction?: () => void; children: React.ReactNode }) {
  return <div className="view"><div className="view-heading"><div><p className="eyebrow">STUDY REPLICA / WORKSPACE</p><h1>{title}</h1><p className="muted">{meta}</p></div><button className="primary" onClick={onAction}>{action}</button></div>{children}</div>;
}

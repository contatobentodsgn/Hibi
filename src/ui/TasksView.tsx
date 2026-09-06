import React, { useState } from 'react';
import type { EntityStatus, StudyData } from '../domain/models';

type Props = {
  data: StudyData;
  onEvent: (action: string, detail: string, result?: string) => void;
  onTaskStatusChange: (id: string, status: EntityStatus) => void;
  onCreateTask?: (title: string) => void;
  onRenameTask?: (id: string, title: string) => void;
  onDeleteTask?: (id: string) => void;
  onEditTaskDeadline?: (id: string) => void;
};

export function TasksView({ data, onEvent, onTaskStatusChange, onCreateTask, onRenameTask, onDeleteTask, onEditTaskDeadline }: Props) {
  const [folder, setFolder] = useState<string | null>(null);
  const [scope, setScope] = useState<'open' | 'all'>('open');
  const [deadlineSort, setDeadlineSort] = useState(false);
  const [creating, setCreating] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const openTasks = data.tasks.filter((task) => task.status !== 'completed' && task.status !== 'paused');
  const visibleTasks = [...data.tasks].filter((task) => (scope === 'all' || (task.status !== 'completed' && task.status !== 'paused')) && (!folder || (task.folder ?? 'Unfiled') === folder)).sort((a, b) => deadlineSort ? (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') : 0);
  const submitNewTask = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const title = newTitle.trim(); if (!title) return; onCreateTask?.(title); setNewTitle(''); setCreating(false); };
  const startEditing = (id: string, title: string) => { setEditingId(id); setEditTitle(title); };
  const submitRename = (event: React.FormEvent<HTMLFormElement>, id: string, currentTitle: string) => { event.preventDefault(); const title = editTitle.trim(); if (title && title !== currentTitle) onRenameTask?.(id, title); setEditingId(null); };

  return <View title="Tasks" meta={`${openTasks.length} open · local study data`} action={creating ? 'Cancel' : '+ New task'} onAction={() => { setCreating(!creating); setNewTitle(''); }}>
    {creating && <form className="quick-input" onSubmit={submitNewTask} aria-label="Create task"><label htmlFor="new-task-title">Task title</label><input id="new-task-title" aria-label="New task title" value={newTitle} onChange={(event) => setNewTitle(event.target.value)} autoFocus /><button className="primary" type="submit">Add task</button></form>}
    <div className="filter-row"><button className={`filter ${scope === 'open' ? 'active' : ''}`} onClick={() => { setScope('open'); onEvent('filter', 'Tasks · Open'); }}>Open {openTasks.length}</button><button className={`filter ${scope === 'all' ? 'active' : ''}`} onClick={() => { setScope('all'); onEvent('filter', 'Tasks · All'); }}>All {data.tasks.length}</button><button className={`filter ${folder === 'Bento' ? 'active' : ''}`} onClick={() => setFolder(folder === 'Bento' ? null : 'Bento')}>Folder · Bento</button><button className={`filter sort ${deadlineSort ? 'active' : ''}`} onClick={() => { setDeadlineSort(!deadlineSort); onEvent('sort', 'Tasks · Deadline'); }}>Deadline ↕</button></div>
    <section className="list-card">{visibleTasks.map((task) => {
      const completed = task.status === 'completed';
      const paused = task.status === 'paused';
      return <div className="task-row" key={task.id}>
        <button className={`check ${completed ? 'checked' : ''}`} aria-label={`${completed ? 'Reopen' : 'Complete'} ${task.title}`} onClick={() => { onTaskStatusChange(task.id, completed ? 'open' : 'completed'); onEvent(completed ? 'reopen' : 'complete', task.title); }}>{completed ? '✓' : ''}</button>
        {editingId === task.id ? <form onSubmit={(event) => submitRename(event, task.id, task.title)}><label htmlFor={`rename-${task.id}`}>Task title</label><input id={`rename-${task.id}`} aria-label={`Rename ${task.title}`} value={editTitle} onChange={(event) => setEditTitle(event.target.value)} autoFocus /><button className="primary" type="submit">Save</button><button className="outline" type="button" onClick={() => setEditingId(null)}>Cancel</button></form> : <div><strong>{task.title}</strong><span>{task.durationMinutes} min · {task.folder ?? 'Unfiled'} · {task.deadline ? `deadline ${task.deadline.replace('T', ' ')}` : 'sem deadline'} · {paused ? 'paused' : task.category}</span></div>}
        {task.folder && <span className="tag orange">{task.folder}</span>}
        {editingId !== task.id && <div className="heading-actions"><button className="more" aria-label={`Rename ${task.title}`} onClick={() => startEditing(task.id, task.title)}>Rename</button><button className="more" aria-label={`Set deadline for ${task.title}`} onClick={() => onEditTaskDeadline?.(task.id)}>Deadline</button><button className="more" aria-label={`Delete ${task.title}`} onClick={() => onDeleteTask?.(task.id)}>Delete</button></div>}
      </div>;
    })}{!visibleTasks.length && <p className="empty">No tasks match these filters.</p>}</section>
  </View>;
}

function View({ title, meta, action, onAction, children }: { title: string; meta: string; action: string; onAction?: () => void; children: React.ReactNode }) {
  return <div className="view"><div className="view-heading"><div><p className="eyebrow">STUDY REPLICA / WORKSPACE</p><h1>{title}</h1><p className="muted">{meta}</p></div><button className="primary" onClick={onAction}>{action}</button></div>{children}</div>;
}

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
  const openTasks = data.tasks.filter((task) => task.status !== 'completed' && task.status !== 'paused');
  const visibleTasks = [...data.tasks].filter((task) => (scope === 'all' || (task.status !== 'completed' && task.status !== 'paused')) && (!folder || (task.folder ?? 'Unfiled') === folder)).sort((a, b) => deadlineSort ? (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') : 0);

  return <View title="Tasks" meta={`${openTasks.length} open · local study data`} action="+ New task" onAction={() => { const title = window.prompt('Nome da tarefa'); if (title?.trim()) onCreateTask?.(title.trim()); }}>
    <div className="filter-row"><button className={`filter ${scope === 'open' ? 'active' : ''}`} onClick={() => { setScope('open'); onEvent('filter', 'Tasks · Open'); }}>Open {openTasks.length}</button><button className={`filter ${scope === 'all' ? 'active' : ''}`} onClick={() => { setScope('all'); onEvent('filter', 'Tasks · All'); }}>All {data.tasks.length}</button><button className={`filter ${folder === 'Bento' ? 'active' : ''}`} onClick={() => setFolder(folder === 'Bento' ? null : 'Bento')}>Folder · Bento</button><button className={`filter sort ${deadlineSort ? 'active' : ''}`} onClick={() => { setDeadlineSort(!deadlineSort); onEvent('sort', 'Tasks · Deadline'); }}>Deadline ↕</button></div>
    <section className="list-card">{visibleTasks.map((task) => {
      const completed = task.status === 'completed';
      const paused = task.status === 'paused';
      return <div className="task-row" key={task.id}>
        <button className={`check ${completed ? 'checked' : ''}`} aria-label={`${completed ? 'Reopen' : 'Complete'} ${task.title}`} onClick={() => { onTaskStatusChange(task.id, completed ? 'open' : 'completed'); onEvent(completed ? 'reopen' : 'complete', task.title); }}>{completed ? '✓' : ''}</button>
        <div><strong>{task.title}</strong><span>{task.durationMinutes} min · {task.folder ?? 'Unfiled'} · {task.deadline ? `deadline ${task.deadline.replace('T', ' ')}` : 'sem deadline'} · {paused ? 'paused' : task.category}</span></div>
        {task.folder && <span className="tag orange">{task.folder}</span>}
        <button className="more" aria-label={`Edit ${task.title}`} onClick={() => { const action = window.prompt('N renomear, D deadline ou X excluir', 'N')?.toUpperCase(); if (action === 'X') { if (window.confirm(`Excluir ${task.title}?`)) onDeleteTask?.(task.id); } else if (action === 'D') onEditTaskDeadline?.(task.id); else { const title = window.prompt('Novo nome da tarefa', task.title); if (title?.trim() && title.trim() !== task.title) onRenameTask?.(task.id, title.trim()); } }}>···</button>
      </div>;
    })}{!visibleTasks.length && <p className="empty">No tasks match these filters.</p>}</section>
  </View>;
}

function View({ title, meta, action, onAction, children }: { title: string; meta: string; action: string; onAction?: () => void; children: React.ReactNode }) {
  return <div className="view"><div className="view-heading"><div><p className="eyebrow">STUDY REPLICA / WORKSPACE</p><h1>{title}</h1><p className="muted">{meta}</p></div><button className="primary" onClick={onAction}>{action}</button></div>{children}</div>;
}

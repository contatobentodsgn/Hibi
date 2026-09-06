import React, { useEffect, useRef, useState } from 'react';

export type NewTaskForm = { title: string; durationMinutes: number; folder: string };

type Props = { onClose: () => void; onSubmit: (task: NewTaskForm) => void };

export function TaskCreateModal({ onClose, onSubmit }: Props) {
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState('60');
  const [folder, setFolder] = useState('Bento');

  useEffect(() => {
    titleRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedTitle = title.trim();
    const durationMinutes = Number(duration);
    if (!trimmedTitle || !Number.isFinite(durationMinutes) || durationMinutes <= 0) return;
    onSubmit({ title: trimmedTitle, durationMinutes, folder: folder.trim() || 'Bento' });
  };

  return <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="palette" role="dialog" aria-modal="true" aria-labelledby="task-create-title">
      <form onSubmit={submit}>
        <div className="palette-search"><div><p className="eyebrow">TASKS / NEW</p><h2 id="task-create-title" style={{ margin: '5px 0 0', font: '500 28px Georgia, serif' }}>Create task</h2></div></div>
        <div style={{ display: 'grid', gap: 16, padding: '22px 20px' }}>
          <label style={{ display: 'grid', gap: 7 }}>Title<input ref={titleRef} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What needs doing?" required /></label>
          <label style={{ display: 'grid', gap: 7 }}>Duration (minutes)<input type="number" min="1" step="1" value={duration} onChange={(event) => setDuration(event.target.value)} required /></label>
          <label style={{ display: 'grid', gap: 7 }}>Folder<input value={folder} onChange={(event) => setFolder(event.target.value)} placeholder="Bento" /></label>
        </div>
        <div className="palette-footer" style={{ justifyContent: 'flex-end', gap: 9 }}><button type="button" className="outline" onClick={onClose}>Cancel</button><button type="submit" className="primary">Create task</button></div>
      </form>
    </div>
  </div>;
}

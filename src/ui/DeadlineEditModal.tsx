import React, { useEffect, useRef, useState } from 'react';

type Props = {
  taskTitle: string;
  deadline?: string;
  onClose: () => void;
  onSubmit: (deadline?: string) => void;
};

const deadlinePattern = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$/;

export function DeadlineEditModal({ taskTitle, deadline, onClose, onSubmit }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(deadline ? deadline.replace('T', ' ') : '');
  const [error, setError] = useState('');

  useEffect(() => {
    inputRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (trimmed && !deadlinePattern.test(trimmed)) {
      setError('Use the format YYYY-MM-DD HH:MM.');
      return;
    }
    onSubmit(trimmed ? trimmed.replace(' ', 'T') : undefined);
  };

  return <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="palette" role="dialog" aria-modal="true" aria-labelledby="deadline-edit-title" aria-describedby="deadline-edit-help">
      <form onSubmit={submit}>
        <div className="palette-search"><div><p className="eyebrow">TASKS / DEADLINE</p><h2 id="deadline-edit-title" style={{ margin: '5px 0 0', font: '500 28px Georgia, serif' }}>Edit task deadline</h2><p id="deadline-edit-help" className="muted" style={{ marginBottom: 0 }}>{taskTitle}</p></div></div>
        <div style={{ display: 'grid', gap: 8, padding: '22px 20px' }}>
          <label htmlFor="task-deadline">Deadline</label>
          <input ref={inputRef} id="task-deadline" name="deadline" aria-label="Deadline" aria-invalid={Boolean(error)} aria-describedby={error ? 'deadline-edit-error deadline-edit-format' : 'deadline-edit-format'} value={value} onChange={(event) => { setValue(event.target.value); setError(''); }} placeholder="YYYY-MM-DD HH:MM" />
          <span id="deadline-edit-format" className="muted">Leave blank to remove the deadline.</span>
          {error && <span id="deadline-edit-error" role="alert" style={{ color: '#984418' }}>{error}</span>}
        </div>
        <div className="palette-footer" style={{ justifyContent: 'flex-end', gap: 9 }}><button type="button" className="outline" onClick={onClose}>Cancel</button><button type="button" className="outline" onClick={() => onSubmit(undefined)}>Remove deadline</button><button type="submit" className="primary">Save deadline</button></div>
      </form>
    </div>
  </div>;
}

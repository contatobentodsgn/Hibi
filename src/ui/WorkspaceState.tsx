import React from 'react';
import './workspace-state.css';

type Props = Readonly<{
  title: string;
  detail?: string;
  action?: string;
  onAction?: () => void;
  tone?: 'empty' | 'error';
}>;

export function WorkspaceState({ title, detail, action, onAction, tone = detail ? 'empty' : 'error' }: Props) {
  return <div className={`workspace-state workspace-state-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
    <span aria-hidden="true">{tone === 'error' ? '!' : '·'}</span>
    <div><strong>{title}</strong>{detail && <p>{detail}</p>}</div>
    {action && onAction && <button className="outline" type="button" onClick={onAction}>{action}</button>}
  </div>;
}

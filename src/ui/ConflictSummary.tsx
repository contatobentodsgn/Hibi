import React from 'react';
import type { ScheduleBlock } from '../domain/models';
import { useT } from '../i18n/LocaleProvider';

const when = (block: ScheduleBlock) => `${block.start.slice(8, 10)}/${block.start.slice(5, 7)} ${block.start.slice(11, 16)}`;

/** O resultado real da conferência de sobreposições, no lugar do "sem conflitos" fixo de antes. */
export function ConflictSummary({ pairs, emptyText }: Readonly<{ pairs: ReadonlyArray<readonly [ScheduleBlock, ScheduleBlock]>; emptyText: string }>) {
  const t = useT();
  if (pairs.length === 0) return <div className="conflict-inline" role="status"><span aria-hidden="true">✓</span><strong>{emptyText}</strong></div>;
  return <div className="conflict-inline has-conflicts" role="status" style={{ background: '#fff0eb', borderColor: '#e2a992', alignItems: 'flex-start' }}><span aria-hidden="true">!</span><div><strong>{t('calendar.conflicts.found')}</strong><ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{pairs.map(([first, second]) => <li key={`${first.id}-${second.id}`}>{first.title} ({when(first)}) × {second.title} ({when(second)})</li>)}</ul></div></div>;
}

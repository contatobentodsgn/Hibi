import React from 'react';
import type { Note } from '../domain/models';
import { deriveNoteRhythm } from './note-rhythm';
import './notes-atelier.css';

type Props = Readonly<{ notes: readonly Note[]; visibleCount: number }>;

export function NotesAtelierSummary({ notes, visibleCount }: Props) {
  const rhythm = deriveNoteRhythm(notes);

  return <section className="notes-atelier-summary" aria-label="Notes capture summary">
    <div className="note-latest"><span>Latest note</span><strong>{rhythm.latest?.title ?? 'Ready to capture'}</strong></div>
    <div><span>Unfiled</span><strong>{rhythm.unfiled}</strong></div>
    <div><span>Showing</span><strong>{visibleCount} of {rhythm.total}</strong></div>
  </section>;
}

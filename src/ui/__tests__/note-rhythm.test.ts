import { describe, expect, it } from 'vitest';
import { deriveNoteRhythm } from '../note-rhythm';

const notes = [
  { id: 'older', title: 'Older', content: '', folder: 'Bento', createdAt: '2026-09-10T08:00:00', updatedAt: '2026-09-10T08:00:00' },
  { id: 'latest', title: 'Latest', content: 'Fresh context', folder: 'Bento', createdAt: '2026-09-11T08:00:00', updatedAt: '2026-09-12T12:30:00' },
  { id: 'unfiled', title: 'Loose', content: '', createdAt: '2026-09-11T09:00:00', updatedAt: '2026-09-11T09:00:00' },
] as const;

describe('deriveNoteRhythm', () => {
  it('selects the most recently updated note without mutating the source list', () => {
    const rhythm = deriveNoteRhythm(notes);

    expect(rhythm).toMatchObject({ latest: notes[1], total: 3, unfiled: 1 });
    expect(notes.map((note) => note.id)).toEqual(['older', 'latest', 'unfiled']);
  });
});

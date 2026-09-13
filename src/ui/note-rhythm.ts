import { folderOf } from '../domain/folders';
import type { Note } from '../domain/models';

export type NoteRhythm = Readonly<{
  latest: Note | null;
  total: number;
  unfiled: number;
}>;

export function deriveNoteRhythm(notes: readonly Note[]): NoteRhythm {
  const ordered = [...notes].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  return {
    latest: ordered[0] ?? null,
    total: notes.length,
    unfiled: notes.filter((note) => !folderOf(note)).length,
  };
}

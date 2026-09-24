import { folderOf } from '../domain/folders';
import type { Note } from '../domain/models';

export type NoteRhythm = Readonly<{
  latest: Note | null;
  total: number;
  unfiled: number;
}>;

export function deriveNoteRhythm(notes: readonly Note[]): NoteRhythm {
  // Comparar instantes, e não texto: um `updatedAt` gravado com fuso — de um backup restaurado, por
  // exemplo — perderia para um em `Z` do mesmo momento, e a nota anunciada como a mais recente seria
  // a errada. É a mesma lição que as conversas do Assistant já tinham registrado em `conversations.ts`.
  const instant = (note: Note) => { const value = Date.parse(note.updatedAt); return Number.isNaN(value) ? -Infinity : value; };
  const ordered = [...notes].sort((left, right) => instant(right) - instant(left));

  return {
    latest: ordered[0] ?? null,
    total: notes.length,
    unfiled: notes.filter((note) => !folderOf(note)).length,
  };
}

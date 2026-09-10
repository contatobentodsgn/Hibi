import React, { useEffect, useMemo, useState } from 'react';
import { folderOf, FOLDER_NAME_MAX, listFolders, NO_FOLDER, type FolderSummary } from '../domain/folders';
import type { Note, StudyData } from '../domain/models';
import { useT } from '../i18n/LocaleProvider';

type Props = { data: StudyData; onCreate: (title: string, content: string, folder: string) => void; onUpdate: (id: string, changes: Partial<Omit<Note, 'id'>>) => void; onDelete: (id: string) => void; initialFolder?: string | null };
type Editor = { id?: string; title: string; content: string; folder: string };

// Mantém visível o chip da pasta ativa mesmo quando ela não tem itens do tipo desta tela (contagem
// 0), logo antes de "Sem pasta" — ou no fim, se não houver grupo "Sem pasta" — para não escondê-la.
function withActiveFolderChip(folders: FolderSummary[], activeFolder: string | null): FolderSummary[] {
  if (activeFolder === null || folders.some((entry) => entry.name === activeFolder)) return folders;
  const chip: FolderSummary = { name: activeFolder, tasks: 0, notes: 0 };
  const noFolderIndex = folders.findIndex((entry) => entry.name === NO_FOLDER);
  return noFolderIndex === -1 ? [...folders, chip] : [...folders.slice(0, noFolderIndex), chip, ...folders.slice(noFolderIndex)];
}

// A pasta volta aparada e pode vir vazia: quem cria decide o padrão, quem edita decide "Sem pasta".
function NoteForm({ editor, folders, onCancel, onSubmit, titleId }: { editor: Editor; folders: readonly string[]; onCancel?: () => void; onSubmit: (title: string, content: string, folder: string) => void; titleId: string }) {
  const [title, setTitle] = useState(editor.title);
  const [content, setContent] = useState(editor.content);
  const [folder, setFolder] = useState(editor.folder);
  // Segue a pasta do filtro ativo até o usuário mexer no campo — depois disso o que foi digitado
  // manda, mesmo que o filtro mude por baixo (evita apagar um rascunho ao trocar de pasta).
  const [folderTouched, setFolderTouched] = useState(false);
  useEffect(() => { if (!folderTouched) setFolder(editor.folder); }, [editor.folder, folderTouched]);
  const isCreate = !editor.id;
  return <form className="settings-card" aria-label={isCreate ? 'Create note' : 'Edit note'} onSubmit={(event) => { event.preventDefault(); if (!title.trim()) return; onSubmit(title.trim(), content, folder.trim()); if (isCreate) { setTitle(''); setContent(''); } }}><label htmlFor={titleId}>Title</label><input id={titleId} className="search-input" value={title} onChange={(event) => setTitle(event.target.value)} required /><label htmlFor={`${titleId}-content`}>Content</label><textarea id={`${titleId}-content`} className="search-input" value={content} onChange={(event) => setContent(event.target.value)} rows={5} /><label htmlFor={`${titleId}-folder`}>Folder</label><input id={`${titleId}-folder`} className="search-input" list={`${titleId}-folders`} value={folder} maxLength={FOLDER_NAME_MAX} placeholder={isCreate ? 'Bento' : undefined} onChange={(event) => { setFolderTouched(true); setFolder(event.target.value); }} /><datalist id={`${titleId}-folders`}>{folders.map((name) => <option key={name} value={name} />)}</datalist><div className="heading-actions"><button className="primary" type="submit">{editor.id ? 'Save note' : 'Add note'}</button>{onCancel && <button className="outline" type="button" onClick={onCancel}>Cancel</button>}</div></form>;
}

export function NotesView({ data, onCreate, onUpdate, onDelete, initialFolder = null }: Props) {
  const t = useT();
  const [query, setQuery] = useState(''); const [folder, setFolder] = useState<string | null>(initialFolder); const [editor, setEditor] = useState<Editor | null>(null); const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);
  const noteFolders = listFolders({ tasks: [], notes: data.notes });
  const allFolders = listFolders(data);
  const suggestions = allFolders.map((entry) => entry.name).filter((name) => name !== NO_FOLDER);
  // Só cai para "Todas" quando a pasta pedida não existe em lugar nenhum (nem em tarefas, nem em
  // notas) — chip removido, ou initialFolder que nunca existiu. Uma pasta sem notas nesta tela
  // continua ativa, com um chip de contagem 0 (ver withActiveFolderChip).
  const activeFolder = folder !== null && allFolders.some((entry) => entry.name === folder) ? folder : null;
  const visibleFolders = withActiveFolderChip(noteFolders, activeFolder);
  // Deriva de activeFolder (não de folder) para que o padrão do formulário nunca discorde do filtro
  // que a tela realmente mostra como ativo.
  const defaultFolder = activeFolder !== null && activeFolder !== NO_FOLDER ? activeFolder : 'Bento';
  const notes = useMemo(() => data.notes.filter((note) => (activeFolder === null || folderOf(note) === activeFolder) && `${note.title} ${note.content}`.toLowerCase().includes(query.toLowerCase())), [data.notes, query, activeFolder]);
  return <div className="view"><div className="view-heading"><div><p className="eyebrow">CAPTURE LAYER</p><h1>Notes</h1><p className="muted">{data.notes.length} local notes · searchable</p></div><button className="primary" onClick={() => setEditor({ title: '', content: '', folder: defaultFolder })}>+ New note</button></div><NoteForm editor={{ title: '', content: '', folder: defaultFolder }} folders={suggestions} titleId="new-note-title" onSubmit={(title, content, nextFolder) => onCreate(title, content, nextFolder || 'Bento')} /><input className="search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search notes" aria-label="Search notes" /><div className="filter-row"><button className={`filter ${activeFolder === null ? 'active' : ''}`} aria-pressed={activeFolder === null} onClick={() => setFolder(null)}>{`${t('folders.label')} · ${t('folders.all')}`}</button>{visibleFolders.map((entry) => <button key={`folder-${entry.name}`} className={`filter ${activeFolder === entry.name ? 'active' : ''}`} aria-pressed={activeFolder === entry.name} onClick={() => setFolder(activeFolder === entry.name ? null : entry.name)}>{`${t('folders.label')} · ${entry.name || t('folders.none')} ${entry.notes}`}</button>)}</div><section className="list-card">{notes.map((note) => <div className="task-row" key={note.id}><div><strong>{note.title}</strong><span>{`${note.content || 'Sem conteúdo'} · ${folderOf(note) || t('folders.none')}`}</span></div><button className="icon-button" aria-label={`Edit ${note.title}`} onClick={() => setEditor({ id: note.id, title: note.title, content: note.content, folder: folderOf(note) })}>✎</button><button className="icon-button" aria-label={`Delete ${note.title}`} onClick={() => setPendingDelete({ id: note.id, title: note.title })}>×</button></div>)}{!notes.length && <p className="empty">No notes match this search.</p>}</section>{editor?.id && <div className="overlay" onMouseDown={() => setEditor(null)}><section className="palette" role="dialog" aria-modal="true" aria-labelledby="edit-note-title" onMouseDown={(event) => event.stopPropagation()}><h2 id="edit-note-title">Edit note</h2><NoteForm editor={editor} folders={suggestions} titleId="edit-note-title-input" onCancel={() => setEditor(null)} onSubmit={(title, content, nextFolder) => { onUpdate(editor.id!, { title, content, folder: nextFolder || undefined, updatedAt: new Date().toISOString() }); setEditor(null); }} /></section></div>}{pendingDelete && <DeleteConfirmation title={pendingDelete.title} onCancel={() => setPendingDelete(null)} onConfirm={() => { onDelete(pendingDelete.id); setPendingDelete(null); }} />}</div>;
}

function DeleteConfirmation({ title, onCancel, onConfirm }: { title: string; onCancel: () => void; onConfirm: () => void }) { return <div className="overlay"><section className="palette" role="dialog" aria-modal="true" aria-labelledby="delete-confirm-title"><h2 id="delete-confirm-title">Delete {title}?</h2><p>This action cannot be undone.</p><button className="outline" type="button" onClick={onCancel} autoFocus>Cancel</button><button className="primary" type="button" onClick={onConfirm}>Confirm delete</button></section></div>; }

import { useMemo, useState, type FormEvent } from 'react';
import { Button, Card } from '@heroui/react';
import { FileText, Folder, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import type { Note, StudyData } from '../../../domain/models';
import { folderOf, FOLDER_NAME_MAX, listFolders, NO_FOLDER } from '../../../domain/folders';
import { ActionDialog } from '../components/ActionDialog';
import { HibiEmptyState } from '../components/HibiEmptyState';
import { HibiUiRoot } from '../components/HibiUiRoot';
import { SectionHeader } from '../components/SectionHeader';
import './notes-screen.css';

type Props = Readonly<{
  data: StudyData;
  onCreate: (title: string, content: string, folder: string) => void;
  onUpdate: (id: string, changes: Partial<Omit<Note, 'id'>>) => void;
  onDelete: (id: string) => void;
  initialFolder?: string | null;
}>;

type Draft = Readonly<{ title: string; content: string; folder: string }>;

const emptyDraft = (folder: string) => ({ title: '', content: '', folder });

export function NotesScreen({ data, onCreate, onUpdate, onDelete, initialFolder = null }: Props) {
  const [query, setQuery] = useState('');
  const [folder, setFolder] = useState<string | null>(initialFolder);
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft(initialFolder && initialFolder !== NO_FOLDER ? initialFolder : 'Bento'));
  const [editing, setEditing] = useState<Note | null>(null);
  const [deleting, setDeleting] = useState<Note | null>(null);

  const folders = listFolders(data);
  const visibleFolders = folder !== null && !folders.some((entry) => entry.name === folder)
    ? [...folders, { name: folder, notes: 0, tasks: 0 }]
    : folders.filter((entry) => entry.notes > 0 || entry.name === folder);
  const notes = useMemo(() => data.notes.filter((note) => {
    const matchesFolder = folder === null ? true : folderOf(note) === folder;
    const haystack = `${note.title} ${note.content}`.toLocaleLowerCase();
    return matchesFolder && haystack.includes(query.toLocaleLowerCase());
  }), [data.notes, folder, query]);
  const suggestions = folders.map((entry) => entry.name).filter((name) => name !== NO_FOLDER);

  const submitCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.title.trim()) return;
    onCreate(draft.title.trim(), draft.content, draft.folder.trim() || 'Bento');
    setDraft(emptyDraft(folder && folder !== NO_FOLDER ? folder : 'Bento'));
    setCreateOpen(false);
  };
  const submitEdit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing || !draft.title.trim()) return;
    onUpdate(editing.id, { title: draft.title.trim(), content: draft.content, folder: draft.folder.trim() || undefined, updatedAt: new Date().toISOString() });
    setEditing(null);
  };

  return <HibiUiRoot className="notes-screen">
    <SectionHeader title="Notes" subtitle={`${data.notes.length} nota${data.notes.length === 1 ? '' : 's'} locais · sem perder o fio`} actions={<Button variant="primary" onPress={() => { setDraft(emptyDraft(folder && folder !== NO_FOLDER ? folder : 'Bento')); setCreateOpen(true); }}><Plus size={17} aria-hidden="true" />Nova nota</Button>} />
    <div className="notes-screen__toolbar">
      <label className="notes-screen__search"><Search size={16} aria-hidden="true" /><span className="sr-only">Pesquisar notas</span><input aria-label="Pesquisar notas" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar notas" /></label>
      <div className="notes-screen__filters" aria-label="Pastas de notas">
        <button type="button" aria-label="Pasta · Todas" aria-pressed={folder === null} data-active={folder === null} onClick={() => setFolder(null)}><Folder size={14} aria-hidden="true" />Todas</button>
        {visibleFolders.map((entry) => <button key={entry.name || 'none'} type="button" aria-label={`Pasta · ${entry.name || 'Sem pasta'} ${entry.notes}`} aria-pressed={folder === entry.name} data-active={folder === entry.name} onClick={() => setFolder(folder === entry.name ? null : entry.name)}>{entry.name || 'Sem pasta'} <span>{entry.notes}</span></button>)}
      </div>
    </div>
    <div className="notes-screen__layout">
      <Card className="notes-screen__list-card">
        <div className="notes-screen__list-heading"><div><h2>{folder ?? 'Todas as notas'}</h2><p>{notes.length} nesta visão</p></div><FileText size={19} aria-hidden="true" /></div>
        {notes.length ? <ul className="notes-screen__list list-card">{notes.map((note) => <li key={note.id} className="notes-screen__row"><div className="notes-screen__note-copy"><strong>{note.title}</strong><p>{note.content || 'Sem conteúdo'}</p><span>{folderOf(note) || 'Sem pasta'} · atualizado {new Date(note.updatedAt).toLocaleDateString('pt-BR')}</span></div><div className="notes-screen__row-actions"><Button isIconOnly variant="ghost" aria-label={`Editar ${note.title}`} onPress={() => { setDraft({ title: note.title, content: note.content, folder: folderOf(note) }); setEditing(note); }}><Pencil size={15} aria-hidden="true" /></Button><Button isIconOnly variant="ghost" aria-label={`Excluir ${note.title}`} onPress={() => setDeleting(note)}><Trash2 size={15} aria-hidden="true" /></Button></div></li>)}</ul> : <HibiEmptyState icon={FileText} tone="lavender" title={folder !== null ? 'Nenhuma nota nesta pasta' : 'Nenhuma nota encontrada'} description={query || folder !== null ? 'No notes match this search.' : 'Comece registrando uma ideia pequena e clara.'} action={<Button variant="secondary" size="sm" onPress={() => { if (folder !== null) { setDraft(emptyDraft(folder === NO_FOLDER ? 'Bento' : folder)); setCreateOpen(true); } else { setQuery(''); setFolder(null); } }}>{folder !== null ? `Criar nota em ${folder === NO_FOLDER ? 'Sem pasta' : folder}` : 'Mostrar todas as notas'}</Button>} />}
      </Card>
      <form className="notes-screen__inline-create" aria-label="Create note" onSubmit={submitCreate}><h2>Capturar uma ideia</h2><label htmlFor="empty-note-title">Title</label><input id="empty-note-title" aria-label="Title" required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Comece uma nota" /><label htmlFor="empty-note-content">Content</label><textarea id="empty-note-content" aria-label="Content" rows={4} value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} placeholder="Escreva sem formatar; o Hibi preserva seu texto." /><label htmlFor="empty-note-folder">Folder</label><input id="empty-note-folder" aria-label="Folder" value={draft.folder} onChange={(event) => setDraft({ ...draft, folder: event.target.value })} /><Button type="submit" variant="primary" aria-label="Add note">Add note</Button></form>
      <Card role="region" className="notes-screen__summary" aria-label="Notes capture summary"><span className="notes-screen__summary-icon"><FileText size={19} aria-hidden="true" /></span><h2>Um lugar para pensar.</h2><p>Suas notas ficam locais, leves e prontas para serem encontradas quando você precisar.</p><strong>{notes.length}</strong><span>visíveis agora</span></Card>
    </div>
    <NoteDialog title="Nova nota" isOpen={createOpen} onOpenChange={setCreateOpen} draft={draft} setDraft={setDraft} folders={suggestions} onSubmit={submitCreate} />
    <NoteDialog title="Editar nota" isOpen={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }} draft={draft} setDraft={setDraft} folders={suggestions} onSubmit={submitEdit} />
    <ActionDialog trigger={<Button className="sr-only" aria-hidden="true">Excluir</Button>} isOpen={deleting !== null} onOpenChange={(open) => { if (!open) setDeleting(null); }} title={`Excluir “${deleting?.title ?? ''}”?`} description="A nota será removida do seu espaço local."><div className="notes-screen__dialog-actions"><Button variant="secondary" onPress={() => setDeleting(null)}>Cancelar</Button><Button variant="danger" onPress={() => { if (deleting) onDelete(deleting.id); setDeleting(null); }}>Excluir nota</Button></div></ActionDialog>
  </HibiUiRoot>;
}

function NoteDialog({ title, isOpen, onOpenChange, draft, setDraft, folders, onSubmit }: Readonly<{ title: string; isOpen: boolean; onOpenChange: (open: boolean) => void; draft: Draft; setDraft: (draft: Draft) => void; folders: readonly string[]; onSubmit: (event: FormEvent<HTMLFormElement>) => void }>) {
  return <ActionDialog trigger={<Button className="sr-only" aria-hidden="true">Abrir</Button>} isOpen={isOpen} onOpenChange={onOpenChange} title={title} description="O conteúdo permanece em texto simples e é salvo no workspace local."><form className="notes-screen__form" aria-label={title === 'Nova nota' ? 'Create note' : 'Edit note'} onSubmit={onSubmit}><label htmlFor={`${title}-title`}>Title</label><input aria-label="Title" id={`${title}-title`} autoFocus required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /><label htmlFor={`${title}-content`}>Content</label><textarea aria-label="Content" id={`${title}-content`} rows={8} value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} /><label htmlFor={`${title}-folder`}>Folder</label><input aria-label="Folder" id={`${title}-folder`} list={`${title}-folders`} maxLength={FOLDER_NAME_MAX} value={draft.folder} onChange={(event) => setDraft({ ...draft, folder: event.target.value })} /><datalist id={`${title}-folders`}>{folders.map((folder) => <option key={folder} value={folder} />)}</datalist><div className="notes-screen__dialog-actions"><Button type="button" variant="secondary" onPress={() => onOpenChange(false)}>Cancel</Button><Button type="submit" variant="primary" aria-label={title === 'Nova nota' ? 'Add note' : 'Save note'}>{title === 'Nova nota' ? 'Add note' : 'Salvar nota'}</Button></div></form></ActionDialog>;
}

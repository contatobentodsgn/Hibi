import React from 'react'
import type { FolderSummary } from '../../domain/folders'
import { useT } from '../../i18n/LocaleProvider'
import { countsLabel, folderLabel, reasonKey, type PaletteView } from './folder-view'

type Props = Readonly<{
  view: Exclude<PaletteView, { kind: 'commands' }>
  folders: readonly FolderSummary[]
  selectedIndex: number
  onHover: (index: number) => void
  onOpen: (index: number) => void
}>

// O campo da paleta continua sendo o único input: aqui só se desenha a lista, a linha de renomear
// ou a confirmação de junção.
export function PaletteFolders({ view, folders, selectedIndex, onHover, onOpen }: Props) {
  const t = useT()
  if (view.kind === 'rename') return <div className="palette-folder-line">
    <strong>{`${t('folders.rename')} “${view.from}”`}</strong>
    <span role="alert">{view.error ? t(reasonKey[view.error]) : ''}</span>
  </div>
  if (view.kind === 'merge') return <div className="palette-folder-line" role="alert">
    <strong>{`${t('folders.merge')} “${view.from}” ${t('folders.into')} “${view.to}”: ${countsLabel(view.tasks, view.notes, t)}`}</strong>
  </div>
  return <>
    {folders.length > 0 && <div role="listbox" id="palette-folders" aria-label={t('folders.list')}>
      {folders.map((folder, index) => <button type="button" className="command-row folder-row" role="option" aria-selected={index === selectedIndex} tabIndex={-1} id={`folder-row-${index}`} key={`folder-${folder.name}`} data-selected={index === selectedIndex} data-folder={folder.name} onMouseEnter={() => onHover(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => onOpen(index)}><span>{folderLabel(folder.name, t)}</span><small>{countsLabel(folder.tasks, folder.notes, t)}</small></button>)}
    </div>}
    {!folders.length && <p className="empty">{t('folders.empty')}</p>}
  </>
}

import { searchConversations, type Conversation } from '../domain/conversations'
import { useT } from '../i18n/LocaleProvider'

export type ConversationListProps = {
  conversations: readonly Conversation[]
  activeId: string | null
  query: string
  onSelect: (id: string) => void
  onSearch: (query: string) => void
  onCreate: () => void
  onDelete: (id: string) => void
  onDeleteAll: () => void
}

export function ConversationList({ conversations, activeId, query, onSelect, onSearch, onCreate, onDelete, onDeleteAll }: ConversationListProps) {
  const t = useT()
  const visible = searchConversations(conversations, query)
  return <section className="list-card" aria-label={t('assistant.conversations')}>
    <div className="view-heading"><div><strong>{t('assistant.conversations')}</strong><p className="muted">{t('assistant.localOnly')}</p></div><div className="heading-actions"><button className="primary" onClick={onCreate}>{t('assistant.newConversation')}</button>{conversations.length > 0 && <button className="outline" onClick={onDeleteAll}>{t('assistant.deleteAll')}</button>}</div></div>
    <input type="search" value={query} aria-label={t('assistant.searchLabel')} placeholder={t('assistant.searchPlaceholder')} onChange={(event) => onSearch(event.target.value)} />
    {conversations.length === 0 && <p className="muted">{t('assistant.empty')}</p>}
    {conversations.length > 0 && visible.length === 0 && <p className="muted">{t('assistant.noMatches')}</p>}
    <ul>{visible.map((conversation) => <li key={conversation.id}><button className="task-row" aria-current={conversation.id === activeId ? 'true' : undefined} onClick={() => onSelect(conversation.id)}>{conversation.title}</button><button className="outline" aria-label={`${t('assistant.delete')}: ${conversation.title}`} onClick={() => onDelete(conversation.id)}>×</button></li>)}</ul>
  </section>
}

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { appendMessage, createConversation } from '../../domain/conversations'
import { LocaleProvider } from '../../i18n/LocaleProvider'
import { ConversationList } from '../ConversationList'

const at = (hour: number) => new Date(2026, 8, 11, hour, 0).toISOString()
const noop = () => undefined
const host = { storage: { getItem: () => null, setItem: noop } }
const first = appendMessage(createConversation('agenda da semana', at(9), 'c-1'), { role: 'assistant', text: 'Reunião com Kabrito', at: at(9) })
const second = createConversation('lista de compras', at(10), 'c-2')

const render = (props: Partial<React.ComponentProps<typeof ConversationList>> = {}) => renderToStaticMarkup(
  <LocaleProvider initialLanguage="pt" host={host}>
    <ConversationList conversations={[second, first]} activeId="c-2" query="" onSelect={noop} onSearch={noop} onCreate={noop} onDelete={noop} onDeleteAll={noop} {...props} />
  </LocaleProvider>,
)

describe('ConversationList', () => {
  it('lists conversations and marks the active one', () => {
    const markup = render()
    expect(markup).toContain('lista de compras')
    expect(markup).toContain('agenda da semana')
    expect(markup).toMatch(/aria-current="true"[^>]*>[^<]*lista de compras/)
  })

  it('shows only the matches for a query', () => {
    const markup = render({ query: 'kabrito' })
    expect(markup).toContain('agenda da semana')
    expect(markup).not.toContain('lista de compras')
  })

  it('explains an empty list and a search with no match', () => {
    expect(render({ conversations: [] })).toContain('Nenhuma conversa salva ainda.')
    expect(render({ query: 'zzz' })).toContain('Nenhuma conversa encontrada.')
  })

  it('says conversations are not in the backup', () => {
    expect(render()).toContain('não entram no backup')
  })
})

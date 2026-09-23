import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CheckCheck } from 'lucide-react'
import { PixanoEmptyState } from '../redesign/components/PixanoEmptyState'
import { RoundLink } from '../redesign/components/RoundLink'
import { SectionHeader } from '../redesign/components/SectionHeader'

describe('componentes comuns da nova UI (U05)', () => {
  it('o cabeçalho de página tem o título da tela, a linha de apoio e as ações, nessa ordem', () => {
    const markup = renderToStaticMarkup(<SectionHeader title="Um dia de cada vez." subtitle="Quinta-feira, 17 de setembro." actions={<button type="button">Criar algo</button>} />)
    expect(markup).toMatch(/^<header[^>]*><div[^>]*><h1[^>]*>Um dia de cada vez\.<\/h1><p[^>]*>Quinta-feira, 17 de setembro\.<\/p><\/div><div[^>]*><button[^>]*>Criar algo<\/button><\/div><\/header>$/)
    // Sem linha de apoio nem ações, nada vazio sobra no cabeçalho.
    expect(renderToStaticMarkup(<SectionHeader title="Notas" />)).toMatch(/^<header[^>]*><div[^>]*><h1[^>]*>Notas<\/h1><\/div><\/header>$/)
  })

  it('o atalho redondo é um botão com nome, e o ícone fica fora do leitor de tela', () => {
    const markup = renderToStaticMarkup(<RoundLink label="Ver tarefas da semana" onPress={() => undefined} />)
    expect(markup).toMatch(/^<button type="button"[^>]*aria-label="Ver tarefas da semana"[^>]*><svg[^>]*aria-hidden="true"/)
  })

  it('o estado vazio usa o nível de título da página, com o ícone escondido do leitor de tela', () => {
    const inCard = renderToStaticMarkup(<PixanoEmptyState icon={CheckCheck} tone="mint" title="Nada pendente por aqui." description="Quando surgir algo, aparece aqui." action={<button type="button">Criar tarefa</button>} />)
    expect(inCard).toMatch(/<span aria-hidden="true"[^>]*data-tone="mint"><svg/)
    expect(inCard).toMatch(/<h3[^>]*>Nada pendente por aqui\.<\/h3><p[^>]*>Quando surgir algo, aparece aqui\.<\/p>/)
    expect(inCard).toContain('<button type="button">Criar tarefa</button>')
    const whole = renderToStaticMarkup(<PixanoEmptyState title="Nenhuma nota ainda." headingLevel={2} />)
    expect(whole).toMatch(/<h2[^>]*>Nenhuma nota ainda\.<\/h2>/)
    expect(whole).not.toContain('aria-hidden')
  })
})

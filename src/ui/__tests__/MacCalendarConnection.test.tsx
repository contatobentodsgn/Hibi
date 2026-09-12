import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MacCalendarConnection } from '../MacCalendarConnection'

describe('MacCalendarConnection', () => {
  it('explains that Calendar access is explicit and never silently requested', () => {
    const markup = renderToStaticMarkup(<MacCalendarConnection onEvent={() => undefined} />)

    expect(markup).toContain('Calendário do Mac')
    expect(markup).toContain('Permitir Calendário')
    expect(markup).toContain('nunca é solicitado silenciosamente')
  })
})

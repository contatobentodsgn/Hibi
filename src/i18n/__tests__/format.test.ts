import { describe, expect, it } from 'vitest'
import { formatDate, formatRange, formatTime, formatWeekday } from '../format'

const at = '2026-09-07T09:00:00'
const end = '2026-09-07T10:30:00'

describe('formatação por locale', () => {
  it('formata hora em 24h e 12h', () => {
    expect(formatTime(at, { locale: 'pt', twentyFourHour: true })).toBe('09:00')
    expect(formatTime(at, { locale: 'en', twentyFourHour: false })).toBe('9:00 AM')
    expect(formatTime(at, { locale: 'en', twentyFourHour: true })).toBe('09:00')
  })

  it('formata data longa no idioma certo', () => {
    expect(formatDate(at, { locale: 'pt', twentyFourHour: true })).toBe('segunda-feira, 7 de setembro de 2026')
    expect(formatDate(at, { locale: 'en', twentyFourHour: true })).toBe('Monday, September 7, 2026')
  })

  it('formata dia da semana curto', () => {
    expect(formatWeekday(at, { locale: 'pt', twentyFourHour: true })).toBe('seg.')
    expect(formatWeekday(at, { locale: 'en', twentyFourHour: true })).toBe('Mon')
  })

  it('formata intervalos com o mesmo relógio', () => {
    expect(formatRange(at, end, { locale: 'pt', twentyFourHour: true })).toBe('09:00 – 10:30')
    expect(formatRange(at, end, { locale: 'en', twentyFourHour: false })).toBe('9:00 AM – 10:30 AM')
  })

  // O horário guardado é hora de parede flutuante, então estes formatadores têm que render os
  // próprios dígitos gravados onde quer que o app rode — exatamente o que as telas já faziam ao
  // fatiar a string. Esta asserção precisa valer nos três fusos em que a suíte roda: São Paulo,
  // Pacific/Kiritimati (UTC+14) e Pacific/Midway (UTC-11). Um `timeZone` fixo aqui a quebraria.
  it('mostra a hora de parede gravada, seja qual for o fuso da máquina', () => {
    expect(formatTime('2026-09-07T09:00:00', { locale: 'pt', twentyFourHour: true })).toBe('09:00')
    expect(formatTime('2026-09-07T23:30:00', { locale: 'en', twentyFourHour: true })).toBe('23:30')
    expect(formatDate('2026-09-07T23:30:00', { locale: 'en', twentyFourHour: true })).toBe('Monday, September 7, 2026')
    expect(formatWeekday('2026-09-07T00:30:00', { locale: 'en', twentyFourHour: true })).toBe('Mon')
  })
})

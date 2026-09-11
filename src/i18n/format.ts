export type Locale = 'pt' | 'en'
export type FormatOptions = Readonly<{ locale: Locale; twentyFourHour: boolean }>

// Sem `timeZone` fixo: o horário guardado é hora de parede local e flutuante (ver
// `domain/wall-clock`), então `new Date('2026-09-11T08:00:00')` é local e rende 08:00 em qualquer
// lugar do mundo. Carimbar São Paulo aqui era o que fazia estes formatadores discordarem das telas,
// que sempre leram os mesmos dígitos por fatia de string.
const tagFor = (locale: Locale) => locale === 'pt' ? 'pt-BR' : 'en-US'
const clock = (options: FormatOptions): Intl.DateTimeFormatOptions => ({ hour: options.twentyFourHour ? '2-digit' : 'numeric', minute: '2-digit', hourCycle: options.twentyFourHour ? 'h23' : 'h12' })

export const formatTime = (iso: string, options: FormatOptions) => new Intl.DateTimeFormat(tagFor(options.locale), clock(options)).format(new Date(iso))

export const formatDate = (iso: string, options: FormatOptions) => new Intl.DateTimeFormat(tagFor(options.locale), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso))

export const formatWeekday = (iso: string, options: FormatOptions) => new Intl.DateTimeFormat(tagFor(options.locale), { weekday: 'short' }).format(new Date(iso))

export const formatRange = (startIso: string, endIso: string, options: FormatOptions) => `${formatTime(startIso, options)} – ${formatTime(endIso, options)}`

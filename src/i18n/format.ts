export type Locale = 'pt' | 'en'
export type FormatOptions = Readonly<{ locale: Locale; twentyFourHour: boolean }>

// O workspace inteiro usa o deslocamento -03:00 (ver OFFSET em DayView/WeekView).
export const HIBI_TIME_ZONE = 'America/Sao_Paulo'

const tagFor = (locale: Locale) => locale === 'pt' ? 'pt-BR' : 'en-US'
const clock = (options: FormatOptions): Intl.DateTimeFormatOptions => ({ hour: options.twentyFourHour ? '2-digit' : 'numeric', minute: '2-digit', hourCycle: options.twentyFourHour ? 'h23' : 'h12', timeZone: HIBI_TIME_ZONE })

export const formatTime = (iso: string, options: FormatOptions) => new Intl.DateTimeFormat(tagFor(options.locale), clock(options)).format(new Date(iso))

export const formatDate = (iso: string, options: FormatOptions) => new Intl.DateTimeFormat(tagFor(options.locale), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: HIBI_TIME_ZONE }).format(new Date(iso))

export const formatWeekday = (iso: string, options: FormatOptions) => new Intl.DateTimeFormat(tagFor(options.locale), { weekday: 'short', timeZone: HIBI_TIME_ZONE }).format(new Date(iso))

export const formatRange = (startIso: string, endIso: string, options: FormatOptions) => `${formatTime(startIso, options)} – ${formatTime(endIso, options)}`

import { ACTIVITY_TYPES, type ActivityRecord, type KnownActivityType } from '../domain/activity';
import { calculateStats, MAX_CUSTOM_PERIOD_DAYS, resolveStatsPeriod, type StatsPeriod, type StatsPreset } from '../domain/stats';
import { activityToCsv, activityToJson } from '../domain/stats-export';
import type { DictionaryKey } from '../i18n/dictionary';
import type { Locale } from '../i18n/format';

export type Translate = (key: DictionaryKey) => string;
export type Unit = (magnitude: number) => string;
export type StatsExportFormat = 'csv' | 'json';
export interface CustomRange { start: string; end: string }
export type PeriodChoice = { period: StatsPeriod; error?: undefined } | { period?: undefined; error: DictionaryKey };

// Sinal de menos tipográfico (U+2212): o hífen costuma ser lido como "traço" por leitores de tela.
export const MINUS = '−';
// BOM: sem ele o Excel abre o CSV em outra codificação e estraga os acentos.
export const UTF8_BOM = '\uFEFF';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

const pad = (value: number) => String(value).padStart(2, '0');
const localDateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const utcDay = (key: string) => {
  const [year, month, day] = key.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
};
const isCalendarDate = (key: string) => DATE_PATTERN.test(key) && new Date(utcDay(key)).toISOString().slice(0, 10) === key;

export function formatSigned(value: number, unit: Unit = String): string {
  if (value > 0) return `+${unit(value)}`;
  if (value < 0) return `${MINUS}${unit(-value)}`;
  return unit(0);
}

export const formatValue = (value: number): string => (value < 0 ? `${MINUS}${-value}` : String(value));

export function formatMinutes(minutes: number): string {
  const total = Math.round(minutes);
  if (total < 0) return `${MINUS}${formatMinutes(-total)}`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

// Função como substituição: nomes de arquivo e títulos podem conter `$&`, que `replace` interpretaria.
export const fillTemplate = (template: string, values: Readonly<Record<string, string>>): string =>
  template.replace(/\{(\w+)\}/g, (match, name: string) => (Object.hasOwn(values, name) ? values[name] : match));

export function comparisonText(delta: number, previousPartial: boolean, t: Translate, unit?: Unit): string {
  if (previousPartial) return t('stats.comparison.unavailable');
  return fillTemplate(t('stats.comparison'), { delta: formatSigned(delta, unit) });
}

export function resolvePeriodChoice(preset: StatsPreset, reference: Date, custom: CustomRange): PeriodChoice {
  try {
    return { period: resolveStatsPeriod(preset, reference, preset === 'custom' ? custom : undefined) };
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    // Quem valida é o domínio; aqui só se escolhe a mensagem que explica o motivo.
    if (preset !== 'custom' || !isCalendarDate(custom.start) || !isCalendarDate(custom.end)) return { error: 'stats.error.invalid' };
    if (custom.end < custom.start) return { error: 'stats.error.order' };
    const days = (utcDay(custom.end) - utcDay(custom.start)) / DAY_MS + 1;
    return { error: days > MAX_CUSTOM_PERIOD_DAYS ? 'stats.error.length' : 'stats.error.invalid' };
  }
}

/** Entrada que explica o erro: data vazia ou ilegível marca a própria entrada; ordem ou tamanho do período marcam o fim. */
export function invalidDateFields(custom: CustomRange, choice: PeriodChoice): (keyof CustomRange)[] {
  if (!choice.error) return [];
  const unreadable = (['start', 'end'] as const).filter((field) => !isCalendarDate(custom[field]));
  return unreadable.length > 0 ? unreadable : ['end'];
}

export const historyTypeOptions = (records: readonly ActivityRecord[]): KnownActivityType[] => {
  const present = new Set(records.map((record) => record.type));
  return ACTIVITY_TYPES.filter((type) => present.has(type));
};

export function buildStatsExport(format: StatsExportFormat, records: readonly ActivityRecord[], referenceDate: Date) {
  const fileName = `hibi-stats-${localDateKey(referenceDate)}.${format}`;
  if (format === 'json') return { fileName, mimeType: 'application/json', content: activityToJson(records) };
  return { fileName, mimeType: 'text/csv;charset=utf-8', content: `${UTF8_BOM}${activityToCsv(records)}` };
}

const tagFor = (locale: Locale) => (locale === 'pt' ? 'pt-BR' : 'en-US');

// `useFormat` fixa o fuso do workspace, mas as estatísticas agrupam pelo fuso local; os rótulos seguem o agrupamento.
// Chaves de dia são datas de calendário: a meia-noite UTC formatada em UTC devolve o mesmo dia em qualquer fuso.
export const formatDayKey = (key: string, locale: Locale) =>
  new Intl.DateTimeFormat(tagFor(locale), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(utcDay(key));

export const formatDayRange = (startKey: string, endKey: string, locale: Locale) =>
  new Intl.DateTimeFormat(tagFor(locale), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).formatRange(utcDay(startKey), utcDay(endKey));

export const formatLocalDateTime = (iso: string, locale: Locale, twentyFourHour: boolean) =>
  new Intl.DateTimeFormat(tagFor(locale), {
    day: 'numeric',
    month: 'short',
    hour: twentyFourHour ? '2-digit' : 'numeric',
    minute: '2-digit',
    hourCycle: twentyFourHour ? 'h23' : 'h12',
  }).format(new Date(iso));

export const periodDayKeys = (period: StatsPeriod): CustomRange => {
  const end = new Date(period.endExclusive);
  return { start: localDateKey(new Date(period.start)), end: localDateKey(new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1)) };
};

export const periodRange = (period: StatsPeriod, locale: Locale) => {
  const keys = periodDayKeys(period);
  return formatDayRange(keys.start, keys.end, locale);
};

export interface PeriodSelection { preset: StatsPreset; custom: CustomRange }
export interface PeriodEvent { detail: string; result?: 'pass' | 'fail' }
/** Próxima seleção, a escolha resolvida para anunciar e o evento de instrumentação, quando houver. */
export interface PeriodStep { selection: PeriodSelection; choice: PeriodChoice; event?: PeriodEvent }

export function selectPreset(current: PeriodSelection, next: StatsPreset, reference: Date): PeriodStep | undefined {
  // Repetir o período ativo não muda nada: nada a anunciar nem a registrar.
  if (next === current.preset) return undefined;
  let custom = current.custom;
  // Na primeira vez, o personalizado parte do período que estava na tela; depois, mantém as datas digitadas.
  if (next === 'custom' && custom.start === '' && custom.end === '') {
    const shown = resolvePeriodChoice(current.preset, reference, custom).period;
    if (shown) custom = periodDayKeys(shown);
  }
  return { selection: { preset: next, custom }, choice: resolvePeriodChoice(next, reference, custom), event: { detail: `Statistics · ${next}` } };
}

export function editCustomRange(current: PeriodSelection, custom: CustomRange, reference: Date): PeriodStep {
  const choice = resolvePeriodChoice('custom', reference, custom);
  const detail = 'Statistics · custom period';
  if (choice.period) return { selection: { ...current, custom }, choice, event: { detail, result: 'pass' } };
  // Uma falha por vez: enquanto as datas continuam inválidas, cada tecla não gera outro evento.
  const wasValid = resolvePeriodChoice('custom', reference, current.custom).period !== undefined;
  return { selection: { ...current, custom }, choice, event: wasValid ? { detail, result: 'fail' } : undefined };
}

// O aviso de histórico parcial entra no anúncio: quem só ouve a página também precisa saber que os números podem estar incompletos.
export function periodAnnouncement(choice: PeriodChoice, records: readonly ActivityRecord[], t: Translate, locale: Locale): string {
  if (!choice.period) return '';
  const showing = fillTemplate(t('stats.showing'), { range: periodRange(choice.period, locale) });
  return calculateStats(records, choice.period).partialHistory ? `${showing} ${t('stats.partial')}` : showing;
}

import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ActivityRecord } from '../../domain/activity';
import { MAX_CUSTOM_PERIOD_DAYS, resolveStatsPeriod } from '../../domain/stats';
import { dictionary, translate, type DictionaryKey } from '../../i18n/dictionary';
import { TIME_FORMAT_STORAGE_KEY, type LocaleHost } from '../../i18n/locale-storage';
import { LocaleProvider } from '../../i18n/LocaleProvider';
import { StatsContent, StatsWorkspace, type StatsContentProps } from '../StatsView';
import {
  buildStatsExport,
  comparisonText,
  editCustomRange,
  fillTemplate,
  formatMinutes,
  formatSigned,
  historyTypeOptions,
  MINUS,
  periodAnnouncement,
  periodRange,
  resolvePeriodChoice,
  selectPreset,
  UTF8_BOM,
  type CustomRange,
  type PeriodSelection,
} from '../stats-format';

// Horários sempre construídos a partir de datas locais, para o teste valer em qualquer fuso.
const at = (month: number, day: number, hour = 9, minute = 0) => new Date(2026, month - 1, day, hour, minute).toISOString();

let sequence = 0;
const record = (type: string, when: string, extra: Partial<ActivityRecord> = {}): ActivityRecord => ({
  id: `activity-${++sequence}`,
  schemaVersion: 1,
  type,
  at: when,
  ...extra,
});

const t = (key: DictionaryKey) => translate('pt', key);
const reference = new Date(2026, 8, 10, 12);
const noop = () => undefined;

const ledger: ActivityRecord[] = [
  record('task.completed', at(8, 20), { title: 'Antigo' }),
  // Semana anterior: 31/ago a 6/set.
  record('task.completed', at(9, 1), { title: 'Relatório' }),
  record('focus.completed', at(9, 2), { durationMinutes: 25 }),
  record('habit.completed', at(9, 3)),
  record('goal.completed', at(9, 4), { title: 'Meta A' }),
  record('goal.completed', at(9, 4, 10), { title: 'Meta B' }),
  // Semana atual: 7 a 13/set.
  record('task.completed', at(9, 7), { entityType: 'task', entityId: 'task-1', title: 'Post Kabrito', durationMinutes: 30, category: 'work', folder: 'Clientes' }),
  record('block.created', at(9, 7, 8), { entityType: 'block', title: 'Bloco manhã', durationMinutes: 120 }),
  record('task.completed', at(9, 8), { title: 'Revisar roteiro', durationMinutes: 45, category: 'learning' }),
  record('task.completed', at(9, 8, 11), { title: 'Ler artigo', durationMinutes: 15, category: 'learning', folder: 'Clientes' }),
  record('block.deleted', at(9, 8, 12), { title: 'Bloco tarde', durationMinutes: 30 }),
  record('task.reopened', at(9, 9), { title: 'Ler artigo', durationMinutes: 15, category: 'learning', folder: 'Clientes' }),
  record('habit.completed', at(9, 9, 7), { title: 'Caminhar' }),
  record('task.completed', at(9, 9, 10), { title: 'Semente', seeded: true }),
  record('habit.completed', at(9, 10, 7), { title: 'Caminhar' }),
  record('focus.completed', at(9, 10, 10), { durationMinutes: 50 }),
  record('focus.cancelled', at(9, 10, 11), { durationMinutes: 10 }),
  record('goal.completed', at(9, 10, 15), { title: 'Lançar portfólio' }),
  record('task.completed', at(9, 10, 16), { title: 'Enviar proposta', durationMinutes: 60, category: 'work', folder: 'Clientes' }),
];

const renderView = (records: readonly ActivityRecord[]) =>
  renderToStaticMarkup(<StatsWorkspace records={records} referenceDate={reference} onEvent={noop} />);

const renderContent = (props: Partial<StatsContentProps>) => renderToStaticMarkup(
  <StatsContent
    records={ledger}
    referenceDate={reference}
    preset="week"
    custom={{ start: '2026-09-07', end: '2026-09-13' }}
    typeFilter="all"
    notice={{ text: '' }}
    onPresetChange={noop}
    onCustomChange={noop}
    onTypeFilterChange={noop}
    onExport={noop}
    {...props}
  />,
);

const cards = (markup: string) => [...markup.matchAll(/<li class="stats-card"[^>]*>([\s\S]*?)<\/li>/g)].map((match) => match[1]);
const figureOf = (markup: string) => /<figure class="stats-chart">([\s\S]*?)<\/figure>/.exec(markup)?.[1] ?? '';
const dailyTaskCells = (markup: string) => [...figureOf(markup).matchAll(/<tr><th scope="row">[^<]*<\/th><td>([^<]*)<\/td>/g)].map((match) => match[1]);
const historyItems = (markup: string) => [...markup.matchAll(/<li class="stats-history-item">([\s\S]*?)<\/li>/g)].map((match) => match[1]);
const optionValues = (markup: string) => [...markup.matchAll(/<option value="([^"]+)"/g)].map((match) => match[1]);
const dateInputFor = (markup: string, label: string) => new RegExp(`>${label}</label>(<input[^>]*>)`).exec(markup)?.[1] ?? '';
const statusOf = (markup: string) => /<p id="[^"]*-status"[^>]*>([\s\S]*?)<\/p>/.exec(markup)?.[1] ?? '';
const textOf = (html: string) => html.replace(/<[^>]*>/g, '');
// O que aparece na tela: sem os trechos que só existem para leitores de tela.
const visibleOf = (markup: string) => markup.replace(/<(\w+) class="stats-visually-hidden">[\s\S]*?<\/\1>/g, '');
const firstRecordOnly = [record('task.completed', at(9, 8), { title: 'Primeira' })];
const noCustom: CustomRange = { start: '', end: '' };

describe('StatsView', () => {
  const markup = renderView(ledger);

  it('renders the page heading and the period presets with their pressed state', () => {
    expect(markup).toContain('class="hibi-section-header__title">Estatísticas</h1>');
    expect(markup).toMatch(/role="group" aria-label="Período"/);
    expect(markup).toMatch(/aria-pressed="false"[^>]*>Hoje</);
    expect(markup).toMatch(/aria-pressed="true"[^>]*>Semana</);
    expect(markup).toMatch(/aria-pressed="false"[^>]*>Mês</);
    expect(markup).toMatch(/aria-pressed="false"[^>]*>Personalizado</);
    expect(markup).not.toContain('type="date"');
  });

  it('shows four summary cards with the previous-period comparison in text', () => {
    const [tasks, focus, habits, goals] = cards(markup);
    expect(cards(markup)).toHaveLength(4);
    expect(markup).toContain('class="stats-card" data-metric="tasks"');
    expect(markup).toContain('class="stats-card" data-metric="focus"');
    expect(tasks).toContain('Tarefas concluídas');
    expect(tasks).toContain('>3<');
    expect(tasks).toContain('+2 em relação ao período anterior');
    expect(focus).toContain('Tempo de foco');
    expect(focus).toContain('>1 h<');
    expect(focus).toContain('Sessões concluídas: 1');
    expect(focus).toContain('+35 min em relação ao período anterior');
    expect(habits).toContain('Check-ins de hábitos');
    expect(habits).toContain('+1 em relação ao período anterior');
    expect(goals).toContain('Metas concluídas');
    expect(goals).toContain(`${MINUS}1 em relação ao período anterior`);
    expect(markup).toContain('Período anterior:');
    expect(markup).not.toContain('Histórico parcial');
  });

  it('draws an accessible daily chart with a sibling table carrying the same signed values', () => {
    const svg = /<svg[^>]*role="img"[^>]*aria-labelledby="([^"]+)"/.exec(markup);
    expect(svg).not.toBeNull();
    expect(markup).toMatch(new RegExp(`<title id="${svg![1]}">Tarefas concluídas por dia, [^<]+</title>`));
    expect(markup).toContain('class="stats-baseline"');
    expect(markup).toMatch(/class="stats-bar stats-bar-negative"[^>]*fill="url\(#/);

    const figure = figureOf(markup);
    expect(figure).toMatch(/<svg[\s\S]*<\/svg>[\s\S]*<table/);
    expect(figure).toMatch(/<caption[^>]*>Valores por dia, [^<]+<\/caption>/);
    expect(figure).toContain('<th scope="col">Dia</th>');
    expect(dailyTaskCells(markup)).toEqual(['1', '2', `${MINUS}1`, '1', '0', '0', '0']);
    expect(figure).toContain(`>${MINUS}1</text>`);
    expect(figure).not.toMatch(/>-\d/);
    expect(figure).toContain('Barras tracejadas abaixo da linha do zero');
  });

  it('compares planned and completed minutes', () => {
    const section = /<section class="stats-section stats-planned"[\s\S]*?<\/section>/.exec(markup)![0];
    expect(section).toContain('Planejado');
    expect(section).toContain('1 h 30 min');
    expect(section).toContain('Concluído');
    expect(section).toContain('2 h 15 min');
  });

  it('lists categories and folders, naming the empty folder', () => {
    const categories = /<section class="stats-section" aria-labelledby="[^"]*-categories"[\s\S]*?<\/section>/.exec(markup)![0];
    expect(categories).toContain('Trabalho');
    expect(categories).toContain('Estudo');
    const folders = /<section class="stats-section" aria-labelledby="[^"]*-folders"[\s\S]*?<\/section>/.exec(markup)![0];
    expect(folders).toContain('Clientes');
    expect(folders).toContain('Sem pasta');
    expect(folders.indexOf('Clientes')).toBeLessThan(folders.indexOf('Sem pasta'));
  });

  it('gives the category and folder tables a visually hidden caption', () => {
    expect(markup).toContain('<table class="stats-table"><caption class="stats-visually-hidden">Tarefas e minutos concluídos por categoria</caption>');
    expect(markup).toContain('<table class="stats-table"><caption class="stats-visually-hidden">Tarefas e minutos concluídos por pasta</caption>');
  });

  it('lists the period history newest first with a type filter', () => {
    const items = historyItems(markup);
    expect(items).toHaveLength(12);
    expect(items[0]).toContain('Enviar proposta');
    expect(items[0]).toContain('Tarefa concluída');
    expect(items[0]).toContain('16:00');
    expect(items.at(-1)).toContain('Bloco manhã');
    expect(items.at(-2)).toContain('Post Kabrito');
    expect(markup).not.toContain('Semente');
    expect(markup).not.toContain('Relatório');

    const select = /<select[^>]*>([\s\S]*?)<\/select>/.exec(markup)![0];
    expect(select).toContain('<option value="all" selected="">Todas</option>');
    expect(optionValues(select)).toEqual(['all', 'task.completed', 'task.reopened', 'focus.completed', 'focus.cancelled', 'habit.completed', 'goal.completed', 'block.created', 'block.deleted']);
    expect(markup).toMatch(/<label[^>]*for="([^"]+)"[^>]*>Tipo de atividade<\/label>/);
  });

  it('offers CSV and JSON exports and a polite live status', () => {
    expect(markup).toMatch(/<button[^>]*>Exportar CSV<\/button>/);
    expect(markup).toMatch(/<button[^>]*>Exportar JSON<\/button>/);
    expect(markup).toMatch(/role="status" aria-live="polite"/);
    expect(markup).not.toContain('Nenhuma atividade registrada neste período');
  });

  it('flags a partial current period and makes every comparison unavailable', () => {
    const partial = renderView([record('task.completed', at(9, 8), { title: 'Primeira' })]);
    expect(partial).toContain('Histórico parcial');
    expect(cards(partial).every((card) => card.includes('Comparação indisponível'))).toBe(true);
    expect(partial).not.toContain('em relação ao período anterior');
  });

  it('makes the comparison unavailable when only the previous period is partial', () => {
    const markup = renderView([record('task.completed', at(9, 2)), record('task.completed', at(9, 8), { title: 'Atual' })]);
    expect(markup).not.toContain('Histórico parcial');
    expect(cards(markup)[0]).toContain('Comparação indisponível');
  });

  it('shows an empty state when the period has no records', () => {
    const empty = renderView([record('task.completed', at(8, 20), { title: 'Antigo' })]);
    expect(empty).toContain('Nenhuma atividade registrada neste período');
    expect(cards(empty)).toHaveLength(4);
    expect(empty).not.toContain('<table');
    expect(empty).not.toContain('Histórico parcial');
    expect(empty).toMatch(/<button[^>]*>Exportar CSV<\/button>/);
    expect(empty).toMatch(/<button[^>]*>Exportar JSON<\/button>/);

    const blank = renderView([]);
    expect(blank).toContain('Nenhuma atividade registrada neste período');
    expect(blank).toContain('Histórico parcial');
    expect(blank).toMatch(/<button[^>]*>Exportar CSV<\/button>/);
    expect(blank).toMatch(/<button[^>]*>Exportar JSON<\/button>/);
  });

  it('renders English labels and 12-hour times when the person prefers them', () => {
    // O idioma entra por prop, mas a preferência de 12 horas só é lida do armazenamento.
    const twelveHour: LocaleHost = { storage: { getItem: (key) => (key === TIME_FORMAT_STORAGE_KEY ? 'false' : null), setItem: noop } };
    const english = renderToStaticMarkup(
      <LocaleProvider initialLanguage="en" host={twelveHour}>
        <StatsWorkspace records={ledger} referenceDate={reference} onEvent={noop} />
      </LocaleProvider>,
    );
    expect(english).toContain('class="hibi-section-header__title">Statistics</h1>');
    expect(english).toMatch(/aria-pressed="true"[^>]*>Week</);
    expect(english).toContain('Tasks completed');
    expect(english).toMatch(/<button[^>]*>Export CSV<\/button>/);
    const items = historyItems(english);
    expect(items[0]).toContain('Task completed');
    expect(items[0]).toMatch(/4:00\sPM/);
    expect(items.at(-1)).toContain('Block created');
    expect(items.at(-1)).toMatch(/8:00\sAM/);
    // Só o texto visível: o atributo dateTime do <time> é ISO em UTC e contém "16:00" num fuso UTC+0.
    expect(items.map((item) => item.replace(/<[^>]*>/g, '')).join(' ')).not.toContain('16:00');
    expect(english).not.toContain('Tarefa concluída');
  });
});

describe('StatsContent', () => {
  it('shows labelled custom date inputs for the custom preset', () => {
    const markup = renderContent({ preset: 'custom', custom: { start: '2026-09-08', end: '2026-09-10' } });
    expect(markup).toMatch(/aria-pressed="true"[^>]*>Personalizado</);
    expect(markup).toMatch(/<label[^>]*for="([^"]+)"[^>]*>Início<\/label><input type="date" id="\1"[^>]*value="2026-09-08"/);
    expect(markup).toMatch(/<label[^>]*for="([^"]+)"[^>]*>Fim<\/label><input type="date" id="\1"[^>]*value="2026-09-10"/);
    expect(dailyTaskCells(markup)).toEqual(['2', `${MINUS}1`, '1']);
  });

  it('shows the invalid-period message instead of crashing', () => {
    const markup = renderContent({ preset: 'custom', custom: { start: '2026-09-10', end: '2026-09-01' } });
    expect(markup).toMatch(/role="status" aria-live="polite"[^>]*>A data final vem antes da inicial/);
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).not.toContain('<svg');
    expect(cards(markup)).toHaveLength(0);
  });

  it('marks as invalid only the date input responsible for the error', () => {
    const invalidInputs = (custom: CustomRange) => {
      const markup = renderContent({ preset: 'custom', custom });
      return ['Início', 'Fim'].filter((label) => dateInputFor(markup, label).includes('aria-invalid="true"'));
    };
    expect(invalidInputs({ start: '', end: '2026-09-10' })).toEqual(['Início']);
    expect(invalidInputs({ start: '2026-02-30', end: '2026-03-01' })).toEqual(['Início']);
    expect(invalidInputs({ start: '2026-09-01', end: '' })).toEqual(['Fim']);
    expect(invalidInputs({ start: '', end: '' })).toEqual(['Início', 'Fim']);
    expect(invalidInputs({ start: '2026-09-10', end: '2026-09-01' })).toEqual(['Fim']);
    expect(invalidInputs({ start: '2025-01-01', end: '2026-01-02' })).toEqual(['Fim']);
    expect(invalidInputs({ start: '2026-09-01', end: '2026-09-10' })).toEqual([]);
  });

  it('filters the history by type and falls back to all for a type not in the period', () => {
    const focus = renderContent({ typeFilter: 'focus.completed' });
    expect(historyItems(focus)).toHaveLength(1);
    expect(historyItems(focus)[0]).toContain('Sessão de foco concluída');
    expect(historyItems(focus)[0]).toContain('50 min');
    expect(focus).toContain('<option value="focus.completed" selected="">');

    const missing = renderContent({ typeFilter: 'goal.progressed' });
    expect(historyItems(missing)).toHaveLength(12);
  });

  it('announces the latest notice in the live status', () => {
    const markup = renderContent({ notice: { text: 'Exportado hibi-stats-2026-09-10.csv.' } });
    expect(markup).toMatch(/role="status" aria-live="polite"[^>]*>Exportado hibi-stats-2026-09-10\.csv\.</);
  });

  it('shows the partial-history sentence once on screen while the live status still announces it', () => {
    const sentence = t('stats.partial');
    const choice = resolvePeriodChoice('week', reference, noCustom);
    const announced = renderContent({ records: firstRecordOnly, notice: periodAnnouncement(choice, firstRecordOnly, t, 'pt') });
    expect(visibleOf(announced).split(sentence)).toHaveLength(2);
    expect(textOf(statusOf(announced))).toContain(sentence);
    // Quem lê a página de cima a baixo já ouviu a frase no status: a caixa visível sai da árvore de acessibilidade.
    expect(announced).toContain(`<p class="stats-notice" aria-hidden="true">${sentence}</p>`);

    // Sem anúncio de período (abertura da página, exportação), a caixa é o único lugar da frase e continua legível.
    const exported = renderContent({ records: firstRecordOnly, notice: { text: 'Exportado hibi-stats-2026-09-10.csv.' } });
    expect(exported.split(sentence)).toHaveLength(2);
    expect(exported).toContain(`<p class="stats-notice">${sentence}</p>`);
  });

  it('shows the value a goal progressed to in the history', () => {
    const markup = renderContent({ records: [...ledger, record('goal.progressed', at(9, 10, 17), { title: 'Ler 12 livros', value: 3 })] });
    const [newest] = historyItems(markup);
    expect(newest).toContain('Progresso em meta');
    expect(newest).toContain('Ler 12 livros · Progresso: 3');
  });
});

describe('stats period selection', () => {
  const week: PeriodSelection = { preset: 'week', custom: noCustom };

  it('does nothing when the active preset is chosen again', () => {
    expect(selectPreset(week, 'week', reference)).toBeUndefined();
    expect(selectPreset({ preset: 'custom', custom: { start: '2026-09-01', end: '2026-09-03' } }, 'custom', reference)).toBeUndefined();
    expect(selectPreset(week, 'month', reference)).toEqual({
      selection: { preset: 'month', custom: noCustom },
      choice: resolvePeriodChoice('month', reference, noCustom),
      event: { detail: 'Statistics · month' },
    });
  });

  it('seeds the custom dates from the visible range only until dates were entered', () => {
    const seeded = selectPreset({ preset: 'month', custom: noCustom }, 'custom', reference)!;
    expect(seeded.selection.custom).toEqual({ start: '2026-09-01', end: '2026-09-30' });
    const typed = editCustomRange(seeded.selection, { start: '2026-09-02', end: '2026-09-04' }, reference).selection;
    const backToWeek = selectPreset(typed, 'week', reference)!.selection;
    expect(selectPreset(backToWeek, 'custom', reference)!.selection.custom).toEqual({ start: '2026-09-02', end: '2026-09-04' });
  });

  it('logs a failed custom period once when it turns invalid, not on every edit while it stays invalid', () => {
    let selection = selectPreset(week, 'custom', reference)!.selection;
    const edit = (custom: CustomRange) => {
      const step = editCustomRange(selection, custom, reference);
      selection = step.selection;
      return step.event;
    };
    const detail = 'Statistics · custom period';
    expect(edit({ start: '2026-09-08', end: '2026-09-13' })).toEqual({ detail, result: 'pass' });
    expect(edit({ start: '2026-09-08', end: '' })).toEqual({ detail, result: 'fail' });
    expect(edit({ start: '', end: '' })).toBeUndefined();
    expect(edit({ start: '2026-09-20', end: '2026-09-10' })).toBeUndefined();
    expect(edit({ start: '2026-09-01', end: '2026-09-10' })).toEqual({ detail, result: 'pass' });
    expect(edit({ start: '2026-09-11', end: '2026-09-10' })).toEqual({ detail, result: 'fail' });
  });

  it('includes the partial-history notice in the announcement of a partial period', () => {
    const choice = resolvePeriodChoice('week', reference, noCustom);
    const showing = `Mostrando ${periodRange(choice.period!, 'pt')}.`;
    // O anúncio é o texto do status inteiro, inclusive o trecho visualmente oculto.
    const announced = (records: readonly ActivityRecord[]) => textOf(statusOf(renderContent({ records, notice: periodAnnouncement(choice, records, t, 'pt') })));
    expect(announced(firstRecordOnly)).toBe(`${showing} ${t('stats.partial')}`);
    expect(announced(ledger)).toBe(showing);
    expect(periodAnnouncement(resolvePeriodChoice('custom', reference, { start: '2026-09-10', end: '2026-09-01' }), ledger, t, 'pt')).toEqual({ text: '' });
  });
});

describe('stats view helpers', () => {
  it('formats signed values with a true minus sign', () => {
    expect(MINUS).toBe('−');
    expect(formatSigned(2)).toBe('+2');
    expect(formatSigned(-1)).toBe('−1');
    expect(formatSigned(0)).toBe('0');
    expect(formatSigned(35, formatMinutes)).toBe('+35 min');
    expect(formatSigned(-90, formatMinutes)).toBe('−1 h 30 min');
  });

  it('formats minutes as hours and minutes', () => {
    expect(formatMinutes(0)).toBe('0 min');
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(60)).toBe('1 h');
    expect(formatMinutes(135)).toBe('2 h 15 min');
    expect(formatMinutes(-5)).toBe('−5 min');
  });

  it('describes the comparison or its absence', () => {
    expect(comparisonText(2, false, t)).toBe('+2 em relação ao período anterior');
    expect(comparisonText(0, false, t)).toBe('0 em relação ao período anterior');
    expect(comparisonText(-35, false, t, formatMinutes)).toBe('−35 min em relação ao período anterior');
    expect(comparisonText(2, true, t)).toBe('Comparação indisponível');
  });

  it('resolves presets and explains invalid custom periods', () => {
    expect(resolvePeriodChoice('week', reference, { start: '', end: '' })).toEqual({ period: resolveStatsPeriod('week', reference) });
    expect(resolvePeriodChoice('custom', reference, { start: '2026-09-10', end: '2026-09-01' })).toEqual({ error: 'stats.error.order' });
    expect(resolvePeriodChoice('custom', reference, { start: '2025-01-01', end: '2026-01-02' })).toEqual({ error: 'stats.error.length' });
    expect(resolvePeriodChoice('custom', reference, { start: '2025-01-01', end: '2026-01-01' })).toHaveProperty('period');
    expect(resolvePeriodChoice('custom', reference, { start: '', end: '2026-09-01' })).toEqual({ error: 'stats.error.invalid' });
    expect(resolvePeriodChoice('custom', reference, { start: '2026-02-30', end: '2026-03-01' })).toEqual({ error: 'stats.error.invalid' });
    expect(fillTemplate(t('stats.error.length'), { days: String(MAX_CUSTOM_PERIOD_DAYS) })).toContain('366');
  });

  it('fills placeholders without interpreting replacement patterns', () => {
    expect(fillTemplate('Exportado {file}.', { file: 'a$&b.csv' })).toBe('Exportado a$&b.csv.');
    expect(fillTemplate('{a} e {b}', { a: '1' })).toBe('1 e {b}');
  });

  it('offers only known types present, in vocabulary order', () => {
    expect(historyTypeOptions([
      record('goal.completed', at(9, 10)),
      record('custom.thing', at(9, 10)),
      record('task.completed', at(9, 10)),
      record('goal.completed', at(9, 11)),
    ])).toEqual(['task.completed', 'goal.completed']);
  });

  it('builds period exports named by the local reference date', () => {
    const records = [record('task.completed', at(9, 10), { title: 'Post', apiKey: 'nope' } as Partial<ActivityRecord>)];
    const csv = buildStatsExport('csv', records, new Date(2026, 8, 10, 23, 30));
    expect(csv.fileName).toBe('hibi-stats-2026-09-10.csv');
    expect(csv.mimeType).toBe('text/csv;charset=utf-8');
    expect(csv.content.startsWith(`${UTF8_BOM}at,type,`)).toBe(true);
    expect(csv.content).toContain('Post');
    const json = buildStatsExport('json', records, new Date(2026, 8, 10, 0, 5));
    expect(json.fileName).toBe('hibi-stats-2026-09-10.json');
    expect(json.mimeType).toBe('application/json');
    expect(JSON.parse(json.content)).toEqual([{ at: at(9, 10), type: 'task.completed', title: 'Post' }]);
  });

  it('exports an empty period as a header-only CSV and an empty JSON list', () => {
    const csv = buildStatsExport('csv', [], reference);
    expect(csv.fileName).toBe('hibi-stats-2026-09-10.csv');
    expect(csv.content).toBe(`${UTF8_BOM}at,type,entityType,entityId,title,durationMinutes,category,folder,value\r\n`);
    const json = buildStatsExport('json', [], reference);
    expect(json.fileName).toBe('hibi-stats-2026-09-10.json');
    expect(json.content).toBe('[]');
  });

  it('translates every statistics key in both languages', () => {
    expect(dictionary.pt['nav.stats']).toBe('Estatísticas');
    expect(dictionary.en['nav.stats']).toBe('Statistics');
    const keys = Object.keys(dictionary.pt).filter((key) => key.startsWith('stats.'));
    expect(keys.length).toBeGreaterThan(40);
    for (const key of keys) expect(dictionary.en[key as DictionaryKey], key).not.toBe('');
  });
});

describe('stats.css', () => {
  const css = readFileSync(new URL('../stats.css', import.meta.url), 'utf8');

  it('uses theme tokens instead of fixed colors', () => {
    expect(css).toContain('var(--');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/rgba?\(/);
  });

  it('collapses the cards, keeps focus visible and respects reduced motion', () => {
    expect(css).toMatch(/@media \(max-width: 900px\)/);
    expect(css).toContain(':focus-visible');
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });

  it('hides captions visually while keeping them for assistive technology', () => {
    const rule = /\.stats-visually-hidden \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toContain('position: absolute');
    expect(rule).toContain('width: 1px');
    expect(rule).toContain('height: 1px');
    expect(rule).toContain('overflow: hidden');
    expect(rule).toMatch(/clip(-path)?:/);
  });
});

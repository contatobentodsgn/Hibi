import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ActivityRecord } from '../../domain/activity';
import { MAX_CUSTOM_PERIOD_DAYS, resolveStatsPeriod } from '../../domain/stats';
import { dictionary, translate, type DictionaryKey } from '../../i18n/dictionary';
import {
  buildStatsExport,
  comparisonText,
  fillTemplate,
  formatMinutes,
  formatSigned,
  historyTypeOptions,
  MINUS,
  resolvePeriodChoice,
  StatsContent,
  StatsView,
  type StatsContentProps,
} from '../StatsView';

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
  renderToStaticMarkup(<StatsView records={records} referenceDate={reference} onEvent={noop} />);

const renderContent = (props: Partial<StatsContentProps>) => renderToStaticMarkup(
  <StatsContent
    records={ledger}
    referenceDate={reference}
    preset="week"
    custom={{ start: '2026-09-07', end: '2026-09-13' }}
    typeFilter="all"
    notice=""
    onPresetChange={noop}
    onCustomChange={noop}
    onTypeFilterChange={noop}
    onExport={noop}
    {...props}
  />,
);

const cards = (markup: string) => [...markup.matchAll(/<li class="stats-card">([\s\S]*?)<\/li>/g)].map((match) => match[1]);
const figureOf = (markup: string) => /<figure class="stats-chart">([\s\S]*?)<\/figure>/.exec(markup)?.[1] ?? '';
const dailyTaskCells = (markup: string) => [...figureOf(markup).matchAll(/<tr><th scope="row">[^<]*<\/th><td>([^<]*)<\/td>/g)].map((match) => match[1]);
const historyItems = (markup: string) => [...markup.matchAll(/<li class="stats-history-item">([\s\S]*?)<\/li>/g)].map((match) => match[1]);
const optionValues = (markup: string) => [...markup.matchAll(/<option value="([^"]+)"/g)].map((match) => match[1]);

describe('StatsView', () => {
  const markup = renderView(ledger);

  it('renders the page heading and the period presets with their pressed state', () => {
    expect(markup).toContain('<h1>Estatísticas</h1>');
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
    expect(empty).not.toContain('Exportar CSV');
    expect(empty).not.toContain('Histórico parcial');

    const blank = renderView([]);
    expect(blank).toContain('Nenhuma atividade registrada neste período');
    expect(blank).toContain('Histórico parcial');
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
    const markup = renderContent({ notice: 'Exportado hibi-stats-2026-09-10.csv.' });
    expect(markup).toMatch(/role="status" aria-live="polite"[^>]*>Exportado hibi-stats-2026-09-10\.csv\.</);
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
    expect(csv.content.startsWith('﻿at,type,')).toBe(true);
    expect(csv.content).toContain('Post');
    const json = buildStatsExport('json', records, new Date(2026, 8, 10, 0, 5));
    expect(json.fileName).toBe('hibi-stats-2026-09-10.json');
    expect(json.mimeType).toBe('application/json');
    expect(JSON.parse(json.content)).toEqual([{ at: at(9, 10), type: 'task.completed', title: 'Post' }]);
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
});

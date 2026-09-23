import { useId, useMemo, useState } from 'react';
import { ACTIVITY_TYPES, type ActivityRecord, type KnownActivityType } from '../domain/activity';
import { NO_FOLDER } from '../domain/folders';
import {
  calculateStats,
  compareStats,
  MAX_CUSTOM_PERIOD_DAYS,
  previousPeriod,
  type DailyMetric,
  type DistributionMetric,
  type StatsComparison,
  type StatsPeriod,
  type StatsPreset,
  type StatsSummary,
} from '../domain/stats';
import { recordsForPeriod } from '../domain/stats-export';
import type { DictionaryKey } from '../i18n/dictionary';
import { useLocale, useT } from '../i18n/LocaleProvider';
import {
  buildStatsExport,
  comparisonText,
  editCustomRange,
  fillTemplate,
  formatDayKey,
  formatLocalDateTime,
  formatMinutes,
  formatValue,
  historyTypeOptions,
  invalidDateFields,
  periodAnnouncement,
  periodRange,
  resolvePeriodChoice,
  selectPreset,
  type CustomRange,
  type PeriodSelection,
  type PeriodStep,
  type StatsExportFormat,
  type StatsNotice,
} from './stats-format';
import './stats.css';
import './redesign/screens/stats-screen.css';
import { HibiUiRoot } from './redesign/components/HibiUiRoot';
import { SectionHeader } from './redesign/components/SectionHeader';

type OnEvent = (action: string, detail: string, result?: string) => void;

const PRESETS: readonly StatsPreset[] = ['today', 'week', 'month', 'custom'];
const PRESET_KEYS: Record<StatsPreset, DictionaryKey> = {
  today: 'stats.preset.today',
  week: 'stats.preset.week',
  month: 'stats.preset.month',
  custom: 'stats.preset.custom',
};
const CATEGORY_KEYS = new Map<string, DictionaryKey>([
  ['work', 'stats.category.work'],
  ['break', 'stats.category.break'],
  ['learning', 'stats.category.learning'],
  ['important', 'stats.category.important'],
  ['wellbeing', 'stats.category.wellbeing'],
  ['none', 'stats.category.none'],
]);
// Um ano de atividade pode ter milhares de linhas: a lista mostra as mais recentes e a exportação traz todas.
const HISTORY_LIMIT = 200;

const typeKey = (type: KnownActivityType): DictionaryKey => `stats.type.${type}`;
const isKnownType = (type: string): type is KnownActivityType => (ACTIVITY_TYPES as readonly string[]).includes(type);

interface StatsReport {
  current: StatsSummary;
  previous: StatsSummary;
  comparison: StatsComparison;
  periodRecords: ActivityRecord[];
}

function buildReport(records: readonly ActivityRecord[], period: StatsPeriod): StatsReport {
  const current = calculateStats(records, period);
  const previous = calculateStats(records, previousPeriod(period));
  return { current, previous, comparison: compareStats(current, previous), periodRecords: recordsForPeriod(records, period) };
}

export function StatsWorkspace({ records, referenceDate, onEvent }: { records: readonly ActivityRecord[]; referenceDate: Date; onEvent: OnEvent }) {
  const t = useT();
  const { language } = useLocale();
  const [selection, setSelection] = useState<PeriodSelection>({ preset: 'week', custom: { start: '', end: '' } });
  const [typeFilter, setTypeFilter] = useState('all');
  const [notice, setNotice] = useState<StatsNotice>({ text: '' });

  const applyPeriod = (step: PeriodStep | undefined) => {
    if (!step) return;
    setSelection(step.selection);
    setNotice(periodAnnouncement(step.choice, records, t, language));
    if (step.event) onEvent('filter', step.event.detail, step.event.result);
  };

  const changePreset = (next: StatsPreset) => applyPeriod(selectPreset(selection, next, referenceDate));
  const changeCustom = (next: CustomRange) => applyPeriod(editCustomRange(selection, next, referenceDate));

  const changeType = (next: string) => {
    setTypeFilter(next);
    onEvent('filter', `Statistics · type · ${next}`);
  };

  const exportRecords = (format: StatsExportFormat, periodRecords: readonly ActivityRecord[]) => {
    const detail = `Statistics ${format.toUpperCase()}`;
    try {
      const file = buildStatsExport(format, periodRecords, referenceDate);
      const url = URL.createObjectURL(new Blob([file.content], { type: file.mimeType }));
      const link = document.createElement('a');
      link.href = url;
      link.download = file.fileName;
      link.click();
      URL.revokeObjectURL(url);
      setNotice({ text: fillTemplate(t('stats.exported'), { file: file.fileName }) });
      onEvent('export', detail, 'pass');
    } catch {
      setNotice({ text: t('stats.exportFailed') });
      onEvent('export', detail, 'fail');
    }
  };

  return (
    <StatsContent
      records={records}
      referenceDate={referenceDate}
      preset={selection.preset}
      custom={selection.custom}
      typeFilter={typeFilter}
      notice={notice}
      onPresetChange={changePreset}
      onCustomChange={changeCustom}
      onTypeFilterChange={changeType}
      onExport={exportRecords}
    />
  );
}


export interface StatsContentProps {
  records: readonly ActivityRecord[];
  referenceDate: Date;
  preset: StatsPreset;
  custom: CustomRange;
  typeFilter: string;
  notice: StatsNotice;
  onPresetChange: (preset: StatsPreset) => void;
  onCustomChange: (custom: CustomRange) => void;
  onTypeFilterChange: (type: string) => void;
  onExport: (format: StatsExportFormat, records: readonly ActivityRecord[]) => void;
}

/** Página sem estado próprio: recebe o período e os filtros escolhidos, para ser renderizada em qualquer estado nos testes. */
export function StatsContent({ records, referenceDate, preset, custom, typeFilter, notice, onPresetChange, onCustomChange, onTypeFilterChange, onExport }: StatsContentProps) {
  const t = useT();
  const { language } = useLocale();
  const id = `stats${useId().replace(/[^\w-]/g, '')}`;
  const choice = resolvePeriodChoice(preset, referenceDate, custom);
  const period = choice.period;
  const periodKey = period ? `${period.preset}|${period.start}|${period.endExclusive}` : '';
  const report = useMemo(() => (period ? buildReport(records, period) : null), [records, periodKey]);
  const statusId = `${id}-status`;
  const status = choice.error ? fillTemplate(t(choice.error), { days: String(MAX_CUSTOM_PERIOD_DAYS) }) : notice.text;
  // O status só carrega o aviso parcial quando mostra o anúncio de período, nunca junto de uma mensagem de erro.
  const announcesPartial = !choice.error && notice.partial === true;
  const invalidFields = invalidDateFields(custom, choice);
  const dateInput = (field: keyof CustomRange, label: DictionaryKey) => (
    <div className="stats-field">
      <label htmlFor={`${id}-${field}`}>{t(label)}</label>
      <input
        type="date"
        id={`${id}-${field}`}
        value={custom[field]}
        aria-invalid={invalidFields.includes(field) ? true : undefined}
        aria-describedby={choice.error ? statusId : undefined}
        onChange={(event) => onCustomChange({ ...custom, [field]: event.target.value })}
      />
    </div>
  );

  return (
    <HibiUiRoot className="stats-screen stats-view stats-view--redesign">
      <SectionHeader title={t('stats.title')} subtitle={period ? periodRange(period, language) : t('stats.noPeriod')} />
      <div className="stats-controls">
        <div className="stats-presets" role="group" aria-label={t('stats.period')}>
          {PRESETS.map((item) => (
            <button key={item} type="button" className="stats-preset" aria-pressed={preset === item} onClick={() => onPresetChange(item)}>
              {t(PRESET_KEYS[item])}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="stats-custom">
            {dateInput('start', 'stats.custom.start')}
            {dateInput('end', 'stats.custom.end')}
          </div>
        )}
      </div>
      <p id={statusId} className={choice.error ? 'stats-status is-error' : 'stats-status'} role="status" aria-live="polite">
        {status}
        {/* A frase já está na caixa logo abaixo: no status ela só é ouvida, e a caixa sai da leitura para não repetir. */}
        {announcesPartial && <span className="stats-visually-hidden">{` ${t('stats.partial')}`}</span>}
      </p>
      {report && (
        <>
          {report.current.partialHistory && <p className="stats-notice" aria-hidden={announcesPartial ? true : undefined}>{t('stats.partial')}</p>}
          <SummaryCards id={id} report={report} />
          {report.periodRecords.length === 0 ? (
            <section className="stats-empty" aria-labelledby={`${id}-empty`}>
              <h2 id={`${id}-empty`}>{t('stats.empty')}</h2>
              <p className="muted">{t('stats.emptyDetail')}</p>
            </section>
          ) : (
            <>
              <DailyChart id={id} daily={report.current.daily} range={periodRange(report.current.period, language)} />
              <PlannedVsCompleted id={id} summary={report.current} />
              <div className="stats-distributions">
                <Distribution id={`${id}-categories`} title="stats.categories" caption="stats.categories.caption" column="stats.column.category" entries={report.current.categories} label={(key) => {
                  const labelKey = CATEGORY_KEYS.get(key);
                  return labelKey ? t(labelKey) : key;
                }} />
                <Distribution id={`${id}-folders`} title="stats.folders" caption="stats.folders.caption" column="stats.column.folder" entries={report.current.folders} label={(key) => (key === NO_FOLDER ? t('folders.none') : key)} />
              </div>
              <History id={id} records={report.periodRecords} typeFilter={typeFilter} onTypeFilterChange={onTypeFilterChange} />
            </>
          )}
          {/* Um período vazio também é exportável: o arquivo sai só com o cabeçalho (CSV) ou `[]` (JSON). */}
          <section className="stats-section stats-export" aria-labelledby={`${id}-export`}>
            <h2 id={`${id}-export`} className="stats-section-title">{t('stats.export')}</h2>
            <p className="muted">{t('stats.export.detail')}</p>
            <div className="stats-actions">
              <button type="button" className="stats-button" onClick={() => onExport('csv', report.periodRecords)}>{t('stats.export.csv')}</button>
              <button type="button" className="stats-button" onClick={() => onExport('json', report.periodRecords)}>{t('stats.export.json')}</button>
            </div>
          </section>
        </>
      )}
    </HibiUiRoot>
  );
}

function SummaryCards({ id, report }: { id: string; report: StatsReport }) {
  const t = useT();
  const { language } = useLocale();
  const { current, previous, comparison } = report;
  const unavailable = previous.partialHistory;
  const cards = [
    { key: 'tasks', label: t('stats.card.tasks'), value: String(current.tasksCompleted), delta: comparisonText(comparison.tasksCompleted, unavailable, t) },
    {
      key: 'focus',
      label: t('stats.card.focus'),
      value: formatMinutes(current.focusMinutes),
      detail: fillTemplate(t('stats.card.focusSessions'), { count: String(current.focusSessions) }),
      delta: comparisonText(comparison.focusMinutes, unavailable, t, formatMinutes),
    },
    { key: 'habits', label: t('stats.card.habits'), value: String(current.habitCheckIns), delta: comparisonText(comparison.habitCheckIns, unavailable, t) },
    { key: 'goals', label: t('stats.card.goals'), value: String(current.goalsCompleted), delta: comparisonText(comparison.goalsCompleted, unavailable, t) },
  ];
  const previousLabel = current.period.preset === 'month' ? 'stats.previousMonth' : 'stats.previousPeriod';

  return (
    <section className="stats-section" aria-labelledby={`${id}-summary`}>
      <h2 id={`${id}-summary`} className="stats-section-title">{t('stats.summary')}</h2>
      <ul className="stats-cards">
        {cards.map((card) => (
          <li className="stats-card" data-metric={card.key} key={card.key}>
            <p className="stats-card-label">{card.label}</p>
            <p className="stats-card-value">{card.value}</p>
            {card.detail && <p className="stats-card-detail">{card.detail}</p>}
            <p className="stats-card-delta">{card.delta}</p>
          </li>
        ))}
      </ul>
      {!unavailable && <p className="stats-previous">{fillTemplate(t(previousLabel), { range: periodRange(previous.period, language) })}</p>}
    </section>
  );
}

const CHART = { width: 640, height: 220, top: 20, bottom: 32, left: 40, right: 12 };
const round = (value: number) => Math.round(value * 100) / 100;

function DailyChart({ id, daily, range }: { id: string; daily: readonly DailyMetric[]; range: string }) {
  const t = useT();
  const { language } = useLocale();
  const values = daily.map((day) => day.tasksCompleted);
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const plotWidth = CHART.width - CHART.left - CHART.right;
  const plotHeight = CHART.height - CHART.top - CHART.bottom;
  const y = (value: number) => round(CHART.top + ((max - value) / (max - min)) * plotHeight);
  const baseline = y(0);
  const slot = plotWidth / daily.length;
  const barWidth = round(Math.max(1, slot * 0.6));
  // Com muitos dias os números sobre as barras se sobrepõem; a tabela ao lado continua com todos.
  const showValues = daily.length <= 14;
  const hatchId = `${id}-hatch`;
  const titleId = `${id}-chart-title`;
  const captionId = `${id}-table-caption`;
  const first = daily[0];
  const last = daily[daily.length - 1];

  return (
    <section className="stats-section" aria-labelledby={`${id}-trend`}>
      <h2 id={`${id}-trend`} className="stats-section-title">{t('stats.trend')}</h2>
      <figure className="stats-chart">
        <svg className="stats-chart-svg" viewBox={`0 0 ${CHART.width} ${CHART.height}`} role="img" aria-labelledby={titleId}>
          <title id={titleId}>{fillTemplate(t('stats.chart.label'), { range })}</title>
          <defs>
            <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect className="stats-hatch-ground" width="6" height="6" />
              <line className="stats-hatch-line" x1="0" y1="0" x2="0" y2="6" />
            </pattern>
          </defs>
          <text className="stats-axis-label" x={CHART.left - 8} y={y(max) + 4} textAnchor="end">{formatValue(max)}</text>
          <text className="stats-axis-label" x={CHART.left - 8} y={baseline + 4} textAnchor="end">0</text>
          {min < 0 && <text className="stats-axis-label" x={CHART.left - 8} y={y(min) + 4} textAnchor="end">{formatValue(min)}</text>}
          {daily.map((day, index) => {
            const value = day.tasksCompleted;
            if (value === 0) return null;
            const x = round(CHART.left + index * slot + (slot - barWidth) / 2);
            const top = value > 0 ? y(value) : baseline;
            const height = round(Math.abs(y(value) - baseline));
            const negative = value < 0;
            return (
              <g key={day.date}>
                <rect className={negative ? 'stats-bar stats-bar-negative' : 'stats-bar stats-bar-positive'} x={x} y={top} width={barWidth} height={height} fill={negative ? `url(#${hatchId})` : undefined} />
                {showValues && (
                  <text className="stats-bar-label" x={round(x + barWidth / 2)} y={negative ? round(y(value) + 14) : round(y(value) - 6)} textAnchor="middle">{formatValue(value)}</text>
                )}
              </g>
            );
          })}
          <line className="stats-baseline" x1={CHART.left} x2={CHART.width - CHART.right} y1={baseline} y2={baseline} />
          {first && <text className="stats-axis-label" x={CHART.left} y={CHART.height - 8} textAnchor="start">{formatDayKey(first.date, language)}</text>}
          {last && daily.length > 1 && <text className="stats-axis-label" x={CHART.width - CHART.right} y={CHART.height - 8} textAnchor="end">{formatDayKey(last.date, language)}</text>}
        </svg>
        {min < 0 && <p className="stats-chart-note">{t('stats.chart.negative')}</p>}
        <div className="stats-table-wrap" role="region" aria-labelledby={captionId} tabIndex={0}>
          <table className="stats-table">
            <caption id={captionId}>{fillTemplate(t('stats.table.caption'), { range })}</caption>
            <thead>
              <tr>
                <th scope="col">{t('stats.column.day')}</th>
                <th scope="col">{t('stats.column.tasks')}</th>
                <th scope="col">{t('stats.column.focus')}</th>
                <th scope="col">{t('stats.column.planned')}</th>
                <th scope="col">{t('stats.column.completed')}</th>
              </tr>
            </thead>
            <tbody>
              {daily.map((day) => (
                <tr key={day.date}>
                  <th scope="row">{formatDayKey(day.date, language)}</th>
                  <td>{formatValue(day.tasksCompleted)}</td>
                  <td>{formatValue(day.focusMinutes)}</td>
                  <td>{formatValue(day.plannedMinutes)}</td>
                  <td>{formatValue(day.completedMinutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </figure>
    </section>
  );
}

function PlannedVsCompleted({ id, summary }: { id: string; summary: StatsSummary }) {
  const t = useT();
  const scale = Math.max(summary.plannedMinutes, summary.completedMinutes);
  const rows = [
    { kind: 'planned', label: t('stats.planned.planned'), minutes: summary.plannedMinutes },
    { kind: 'completed', label: t('stats.planned.completed'), minutes: summary.completedMinutes },
  ];

  return (
    <section className="stats-section stats-planned" aria-labelledby={`${id}-planned`}>
      <h2 id={`${id}-planned`} className="stats-section-title">{t('stats.planned.title')}</h2>
      <p className="muted">{t('stats.planned.detail')}</p>
      <dl className="stats-meters">
        {rows.map((row) => (
          <div className="stats-meter" key={row.kind}>
            <dt>{row.label}</dt>
            <dd>
              <span className="stats-meter-value">{formatMinutes(row.minutes)}</span>
              <span className="stats-meter-track" aria-hidden="true">
                <span className={`stats-meter-fill stats-meter-${row.kind}`} style={{ width: `${scale ? round((row.minutes / scale) * 100) : 0}%` }} />
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Distribution({ id, title, caption, column, entries, label }: { id: string; title: DictionaryKey; caption: DictionaryKey; column: DictionaryKey; entries: readonly DistributionMetric[]; label: (key: string) => string }) {
  const t = useT();
  return (
    <section className="stats-section" aria-labelledby={id}>
      <h2 id={id} className="stats-section-title">{t(title)}</h2>
      {entries.length === 0 ? (
        <p className="muted">{t('stats.distribution.empty')}</p>
      ) : (
        <table className="stats-table">
          <caption className="stats-visually-hidden">{t(caption)}</caption>
          <thead>
            <tr>
              <th scope="col">{t(column)}</th>
              <th scope="col">{t('stats.column.tasks')}</th>
              <th scope="col">{t('stats.column.completed')}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.key}>
                <th scope="row">{label(entry.key)}</th>
                <td>{formatValue(entry.tasksCompleted)}</td>
                <td>{formatMinutes(entry.minutes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function History({ id, records, typeFilter, onTypeFilterChange }: { id: string; records: readonly ActivityRecord[]; typeFilter: string; onTypeFilterChange: (type: string) => void }) {
  const t = useT();
  const { language, twentyFourHour } = useLocale();
  const options = historyTypeOptions(records);
  // Um filtro de outro período que não existe neste volta para "todas" em vez de esconder tudo.
  const active = isKnownType(typeFilter) && options.includes(typeFilter) ? typeFilter : 'all';
  const newestFirst = (active === 'all' ? [...records] : records.filter((record) => record.type === active)).reverse();
  const shown = newestFirst.slice(0, HISTORY_LIMIT);
  const describe = (record: ActivityRecord) =>
    [
      record.title,
      record.durationMinutes === undefined ? undefined : formatMinutes(record.durationMinutes),
      record.type === 'goal.progressed' && record.value !== undefined ? fillTemplate(t('stats.history.progress'), { value: formatValue(record.value) }) : undefined,
    ].filter(Boolean).join(' · ');

  return (
    <section className="stats-section" aria-labelledby={`${id}-history`}>
      <div className="stats-section-head">
        <h2 id={`${id}-history`} className="stats-section-title">{t('stats.history')}</h2>
        <div className="stats-field">
          <label htmlFor={`${id}-type`}>{t('stats.history.filter')}</label>
          <select id={`${id}-type`} value={active} onChange={(event) => onTypeFilterChange(event.target.value)}>
            <option value="all">{t('stats.history.all')}</option>
            {options.map((type) => <option key={type} value={type}>{t(typeKey(type))}</option>)}
          </select>
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="muted">{t('stats.history.empty')}</p>
      ) : (
        <ol className="stats-history">
          {shown.map((record) => (
            <li className="stats-history-item" key={record.id}>
              <time dateTime={record.at}>{formatLocalDateTime(record.at, language, twentyFourHour)}</time>
              <span className="stats-history-type">{isKnownType(record.type) ? t(typeKey(record.type)) : record.type}</span>
              <span className="stats-history-title">{describe(record)}</span>
            </li>
          ))}
        </ol>
      )}
      {newestFirst.length > HISTORY_LIMIT && (
        <p className="muted">{fillTemplate(t('stats.history.limited'), { shown: String(HISTORY_LIMIT), total: String(newestFirst.length) })}</p>
      )}
    </section>
  );
}

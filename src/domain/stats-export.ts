import type { ActivityRecord } from './activity';
import type { StatsPeriod } from './stats';

export const EXPORT_FIELDS = ['at', 'type', 'entityType', 'entityId', 'title', 'durationMinutes', 'category', 'folder', 'value'] as const;
type ExportField = (typeof EXPORT_FIELDS)[number];
export type ExportedActivity = Partial<Pick<ActivityRecord, ExportField>>;

const NUMERIC_FIELDS = new Set<ExportField>(['durationMinutes', 'value']);
// Planilhas executam células que começam assim como fórmula (CSV injection).
const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;

const timeOf = (record: ActivityRecord) => new Date(record.at).getTime();

export function recordsForPeriod(records: readonly ActivityRecord[], period: StatsPeriod): ActivityRecord[] {
  const start = new Date(period.start).getTime();
  const end = new Date(period.endExclusive).getTime();
  return records
    .filter((record) => {
      if (record.seeded === true) return false;
      const at = timeOf(record);
      return at >= start && at < end;
    })
    .sort((a, b) => timeOf(a) - timeOf(b));
}

// Copia campo a campo: nada fora da lista (id, seeded, chaves estranhas) sai do app.
function pick(record: ActivityRecord): ExportedActivity {
  const exported: Record<string, unknown> = {};
  for (const field of EXPORT_FIELDS) {
    if (record[field] !== undefined) exported[field] = record[field];
  }
  return exported as ExportedActivity;
}

function csvCell(field: ExportField, value: unknown): string {
  if (value === undefined || value === null) return '';
  if (NUMERIC_FIELDS.has(field) && typeof value === 'number') return String(value);
  const text = String(value);
  const safe = FORMULA_START.test(text) ? `'${text}` : text;
  return NEEDS_QUOTES.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function activityToCsv(records: readonly ActivityRecord[]): string {
  const rows = records.map((record) => EXPORT_FIELDS.map((field) => csvCell(field, record[field])).join(','));
  return [EXPORT_FIELDS.join(','), ...rows].map((row) => `${row}\r\n`).join('');
}

export function activityToJson(records: readonly ActivityRecord[]): string {
  return JSON.stringify(records.map(pick), null, 2);
}

import type { ScheduleBlock } from './models';

// DTSTART/DTEND na forma flutuante do RFC 5545 ("form 1": data-hora local, sem `Z` e sem `TZID`),
// que é exatamente a semântica do horário guardado pelo app. A exportação antiga fazia
// `start.replace(/[-:]/g, '')` sobre um valor com offset e produzia `20260911T0800000300` — o
// `-03:00` virava `0300` grudado no fim, e o DTSTART saía inválido. Montar os dígitos por posição,
// em vez de apagar pontuação, não tem como reintroduzir o defeito.
const STAMP = /^\d{8}T\d{6}$/;

export const toIcsStamp = (wallClock: string): string =>
  `${wallClock.slice(0, 4)}${wallClock.slice(5, 7)}${wallClock.slice(8, 10)}T${wallClock.slice(11, 13)}${wallClock.slice(14, 16)}${wallClock.slice(17, 19) || '00'}`;

export const fromIcsStamp = (stamp: string): string =>
  `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(9, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}`;

const escapeText = (value: string) => value.replace(/[\\;,]/g, '\\$&').replace(/\n/g, '\\n');
// Numa passada só: em duas, um título com barra invertida literal (`C:\night`) teria a própria
// barra escapada relida como quebra de linha.
const unescapeText = (value: string) => value.replace(/\\([\\;,nN])/g, (_, char: string) => char === 'n' || char === 'N' ? '\n' : char);

export function toIcsCalendar(blocks: readonly ScheduleBlock[]): string {
  const events = blocks
    .map((block) => `BEGIN:VEVENT\nUID:${block.id}@hibi\nDTSTART:${toIcsStamp(block.start)}\nDTEND:${toIcsStamp(block.end)}\nSUMMARY:${escapeText(block.title)}\nEND:VEVENT`)
    .join('\n');
  return `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Hibi//EN\n${events}\nEND:VCALENDAR`;
}

export type IcsEvent = Readonly<{ title: string; start: string; end: string }>;
/** O que o arquivo trouxe e o que ficou de fora, para a tela dizer em vez de sumir calada. */
export type IcsImport = Readonly<{ events: IcsEvent[]; skippedAllDay: number; skippedInvalid: number }>;

const pad = (value: number) => String(value).padStart(2, '0');
const localWallClock = (instant: Date) =>
  `${instant.getFullYear()}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())}T${pad(instant.getHours())}:${pad(instant.getMinutes())}:${pad(instant.getSeconds())}`;

// Quanto o fuso `timeZone` está à frente do UTC num instante, em ms. `null` para um TZID que o Intl
// não conhece (os nomes do Windows, por exemplo).
const zoneOffsetMs = (timeZone: string, utcMs: number): number | null => {
  try {
    const parts: Record<string, number> = {};
    const format = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    for (const part of format.formatToParts(new Date(utcMs))) if (part.type !== 'literal') parts[part.type] = Number(part.value);
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - utcMs;
  } catch { return null; }
};

// Um carimbo do arquivo na hora de parede deste Mac. Três formas no RFC 5545: `Z` é um instante em UTC
// (o que o Google exporta); `TZID` é a hora de parede daquele fuso; sem nenhum dos dois é flutuante, e
// fica como está — é a forma que o próprio Hibi exporta.
const toWallClock = (stamp: string, utc: boolean, timeZone: string | undefined): string => {
  const floating = fromIcsStamp(stamp);
  if (!utc && !timeZone) return floating;
  const asUtc = Date.UTC(Number(stamp.slice(0, 4)), Number(stamp.slice(4, 6)) - 1, Number(stamp.slice(6, 8)), Number(stamp.slice(9, 11)), Number(stamp.slice(11, 13)), Number(stamp.slice(13, 15)));
  if (utc) return localWallClock(new Date(asUtc));
  // A hora de parede de outro fuso vira instante descontando o offset dele naquele momento; o segundo
  // passo acerta o caso em que o offset muda entre o palpite e o resultado (horário de verão).
  const first = zoneOffsetMs(timeZone!, asUtc);
  if (first === null) return floating;
  const second = zoneOffsetMs(timeZone!, asUtc - first) ?? first;
  return localWallClock(new Date(asUtc - second));
};

// Linhas dobradas (RFC 5545 §3.1): quebra seguida de espaço ou tab continua a linha anterior.
const unfold = (text: string) => text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');

type Stamp = Readonly<{ value: string; utc: boolean; timeZone?: string }> | 'all-day' | undefined;
const readStamp = (body: string, name: 'DTSTART' | 'DTEND'): Stamp => {
  const line = body.match(new RegExp(`^${name}((?:;[^:\\n]*)?):(.*)$`, 'm'));
  if (!line) return undefined;
  const params = line[1];
  const value = line[2].trim();
  if (/;VALUE=DATE(?:;|$)/i.test(params) || /^\d{8}$/.test(value)) return 'all-day';
  const match = value.match(/^(\d{8}T\d{6})(Z?)$/);
  if (!match) return undefined;
  const timeZone = params.match(/;TZID=("?)([^;"]+)\1/i)?.[2];
  return { value: match[1], utc: match[2] === 'Z', ...(timeZone ? { timeZone } : {}) };
};

/**
 * Os eventos do arquivo na hora de parede deste Mac. Evento de dia inteiro não vira bloco — o plano do
 * Hibi é por horário, e um bloco das 00:00 às 24:00 ocuparia o dia —, mas é contado, como o evento sem
 * horário utilizável.
 */
export function readIcsCalendar(text: string): IcsImport {
  const events: IcsEvent[] = [];
  let skippedAllDay = 0;
  let skippedInvalid = 0;
  for (const match of unfold(text).matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g)) {
    const body = match[1];
    const start = readStamp(body, 'DTSTART');
    const end = readStamp(body, 'DTEND');
    if (start === 'all-day') { skippedAllDay += 1; continue; }
    if (!start || !end || end === 'all-day' || !STAMP.test(start.value) || !STAMP.test(end.value)) { skippedInvalid += 1; continue; }
    const title = body.match(/^SUMMARY(?:;[^:\n]*)?:(.*)$/m)?.[1]?.trim();
    events.push({ title: title ? unescapeText(title) : 'Imported event', start: toWallClock(start.value, start.utc, start.timeZone), end: toWallClock(end.value, end.utc, end.timeZone) });
  }
  return { events, skippedAllDay, skippedInvalid };
}

export const parseIcsEvents = (text: string): IcsEvent[] => readIcsCalendar(text).events;

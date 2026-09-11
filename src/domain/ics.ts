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

/** Um evento vindo de qualquer fuso entra como hora de parede: é o que o calendário mostrava nele. */
export function parseIcsEvents(text: string): IcsEvent[] {
  const events: IcsEvent[] = [];
  for (const match of text.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g)) {
    const body = match[1];
    const start = body.match(/DTSTART(?:;[^:\n]+)?:(\d{8}T\d{6})/)?.[1];
    const end = body.match(/DTEND(?:;[^:\n]+)?:(\d{8}T\d{6})/)?.[1];
    const title = body.match(/SUMMARY:(.*)/)?.[1]?.trim();
    if (start && end && STAMP.test(start) && STAMP.test(end)) {
      events.push({ title: title ? unescapeText(title) : 'Imported event', start: fromIcsStamp(start), end: fromIcsStamp(end) });
    }
  }
  return events;
}

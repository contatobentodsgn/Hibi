import { describe, expect, it } from 'vitest';
import { parseIcsEvents, toIcsCalendar, toIcsStamp } from '../ics';
import type { ScheduleBlock } from '../models';

const block = (id: string, title: string, start: string, end: string): ScheduleBlock => ({ id, title, start, end, category: 'work' });
const stamps = (ics: string) => [...ics.matchAll(/^DT(?:START|END):(.*)$/gm)].map((match) => match[1]);

describe('exportação ICS', () => {
  it('emite DTSTART/DTEND na forma flutuante do RFC 5545', () => {
    const ics = toIcsCalendar([block('b1', 'Estudo', '2026-09-11T08:00:00', '2026-09-11T09:00:00')]);

    expect(ics).toContain('DTSTART:20260911T080000');
    expect(ics).toContain('DTEND:20260911T090000');
    expect(stamps(ics)).toHaveLength(2);
    for (const stamp of stamps(ics)) expect(stamp).toMatch(/^\d{8}T\d{6}$/);
  });

  // O defeito real que este PR fecha: `'2026-09-11T08:00:00-03:00'.replace(/[-:]/g, '')` produzia
  // `20260911T0800000300` — vinte caracteres, com o `-03:00` virando `0300` grudado no fim. Nenhum
  // calendário lê isso como DTSTART. Montar os dígitos por posição não tem como reproduzir o bug,
  // nem mesmo se um valor legado com offset chegar ao exportador.
  it('nunca emite o offset grudado, mesmo recebendo um valor legado com fuso', () => {
    expect(toIcsStamp('2026-09-11T08:00:00-03:00')).toBe('20260911T080000');
    expect(toIcsStamp('2026-09-11T08:00:00-03:00')).not.toContain('0300');

    const ics = toIcsCalendar([block('b1', 'Estudo', '2026-09-11T08:00:00-03:00', '2026-09-11T09:00:00-03:00')]);
    for (const stamp of stamps(ics)) expect(stamp).toMatch(/^\d{8}T\d{6}$/);
  });

  it('completa os segundos ausentes em vez de emitir um carimbo curto', () => {
    expect(toIcsStamp('2026-09-11T08:00')).toBe('20260911T080000');
  });
});

describe('importação ICS', () => {
  it('lê um evento de qualquer fuso como hora de parede, sem carimbar offset', () => {
    const events = parseIcsEvents([
      'BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:tokyo',
      'DTSTART;TZID=Asia/Tokyo:20260911T210000', 'DTEND;TZID=Asia/Tokyo:20260911T220000',
      'SUMMARY:Evento importado', 'END:VEVENT', 'END:VCALENDAR',
    ].join('\n'));

    expect(events).toEqual([{ title: 'Evento importado', start: '2026-09-11T21:00:00', end: '2026-09-11T22:00:00' }]);
  });

  it('ignora o evento sem DTSTART/DTEND utilizável', () => {
    expect(parseIcsEvents('BEGIN:VEVENT\nUID:x\nSUMMARY:Sem horário\nEND:VEVENT')).toEqual([]);
  });

  it('dá um título ao evento sem SUMMARY', () => {
    expect(parseIcsEvents('BEGIN:VEVENT\nDTSTART:20260911T080000\nDTEND:20260911T090000\nEND:VEVENT')[0].title).toBe('Imported event');
  });
});

describe('ida e volta pelo ICS', () => {
  it('devolve exatamente os mesmos horários flutuantes que saíram', () => {
    const blocks = [
      block('b1', 'Estudo', '2026-09-11T08:00:00', '2026-09-11T09:00:00'),
      block('b2', 'Aula de inglês', '2026-09-11T21:00:00', '2026-09-11T22:30:00'),
    ];

    const round = parseIcsEvents(toIcsCalendar(blocks));

    expect(round).toEqual(blocks.map(({ title, start, end }) => ({ title, start, end })));
  });

  it('preserva título com vírgula, ponto-e-vírgula e quebra de linha', () => {
    const blocks = [block('b1', 'Estudo; revisão, parte 2\nsegunda linha', '2026-09-11T08:00:00', '2026-09-11T09:00:00')];

    expect(parseIcsEvents(toIcsCalendar(blocks))[0].title).toBe('Estudo; revisão, parte 2\nsegunda linha');
  });

  it('um valor legado com offset sai válido e volta como a mesma hora de parede', () => {
    const round = parseIcsEvents(toIcsCalendar([block('b1', 'Estudo', '2026-09-11T08:00:00-03:00', '2026-09-11T09:00:00-03:00')]));

    expect(round).toEqual([{ title: 'Estudo', start: '2026-09-11T08:00:00', end: '2026-09-11T09:00:00' }]);
  });
});

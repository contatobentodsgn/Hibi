import { describe, expect, it } from 'vitest';
import { parseIcsEvents, readIcsCalendar, toIcsCalendar, toIcsStamp } from '../ics';
import type { ScheduleBlock } from '../models';

const block = (id: string, title: string, start: string, end: string): ScheduleBlock => ({ id, title, start, end, category: 'work' });
const stamps = (ics: string) => [...ics.matchAll(/^DT(?:START|END):(.*)$/gm)].map((match) => match[1]);

describe('exportação ICS', () => {
  it('emite DTSTART/DTEND na forma flutuante do RFC 5545', () => {
    const ics = toIcsCalendar([block('b1', 'Estudo', '2026-09-11T08:00:00', '2026-09-11T09:00:00')]);

    expect(ics).toContain('DTSTART:20260911T080000');
    expect(ics).toContain('DTEND:20260911T090000');
    expect(ics).toContain('PRODID:-//Pixano//EN');
    expect(ics).toContain('UID:b1@hibi');
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
  // A hora de parede gravada é a deste Mac: lida de volta como hora local, ela tem que ser o mesmo instante
  // que o arquivo descreve. Vale em qualquer fuso em que a suíte rode.
  const instantOf = (wallClock: string) => new Date(wallClock).getTime();
  const one = (lines: string[]) => readIcsCalendar(['BEGIN:VCALENDAR', 'BEGIN:VEVENT', ...lines, 'SUMMARY:Evento', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n'));

  it('um horário em UTC (o que o Google exporta) entra no instante certo, não como hora local', () => {
    const { events } = one(['DTSTART:20260911T110000Z', 'DTEND:20260911T123000Z']);

    expect(events).toHaveLength(1);
    expect(instantOf(events[0].start)).toBe(Date.UTC(2026, 8, 11, 11, 0));
    expect(instantOf(events[0].end)).toBe(Date.UTC(2026, 8, 11, 12, 30));
    expect(events[0].start).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  });

  it('um horário com TZID é a hora de parede daquele fuso', () => {
    const { events } = one(['DTSTART;TZID=Asia/Tokyo:20260911T210000', 'DTEND;TZID=Asia/Tokyo:20260911T220000']);

    expect(instantOf(events[0].start)).toBe(Date.UTC(2026, 8, 11, 12, 0));
    expect(instantOf(events[0].end)).toBe(Date.UTC(2026, 8, 11, 13, 0));
  });

  it('usa o offset do fuso na data do evento, com e sem horário de verão', () => {
    const inverno = one(['DTSTART;TZID="America/New_York":20260115T090000', 'DTEND;TZID="America/New_York":20260115T100000']).events[0];
    const verao = one(['DTSTART;TZID=America/New_York:20260310T090000', 'DTEND;TZID=America/New_York:20260310T100000']).events[0];

    expect(instantOf(inverno.start)).toBe(Date.UTC(2026, 0, 15, 14, 0));
    expect(instantOf(verao.start)).toBe(Date.UTC(2026, 2, 10, 13, 0));
  });

  it('acerta o offset no dia em que o horário de verão começa', () => {
    // 03:30 em Nova York no dia 08/03/2026 já é horário de verão (-4), mas às 03:30 UTC ainda era -5.
    const virada = one(['DTSTART;TZID=America/New_York:20260308T033000', 'DTEND;TZID=America/New_York:20260308T043000']).events[0];

    expect(instantOf(virada.start)).toBe(Date.UTC(2026, 2, 8, 7, 30));
  });

  it('um TZID desconhecido fica como hora de parede, em vez de derrubar o evento', () => {
    expect(one(['DTSTART;TZID=Pacific Standard Time:20260911T080000', 'DTEND;TZID=Pacific Standard Time:20260911T090000']).events[0])
      .toEqual({ title: 'Evento', start: '2026-09-11T08:00:00', end: '2026-09-11T09:00:00' });
  });

  it('evento de dia inteiro não vira bloco, mas é contado', () => {
    const result = readIcsCalendar([
      'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20260911', 'DTEND;VALUE=DATE:20260912', 'SUMMARY:Feriado', 'END:VEVENT',
      'BEGIN:VEVENT', 'DTSTART:20260911T080000', 'DTEND:20260911T090000', 'SUMMARY:Aula', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:x', 'SUMMARY:Sem horário', 'END:VEVENT',
    ].join('\n'));

    expect(result.events.map((event) => event.title)).toEqual(['Aula']);
    expect(result.skippedAllDay).toBe(1);
    expect(result.skippedInvalid).toBe(1);
  });

  it('junta linhas dobradas e aceita SUMMARY com parâmetro', () => {
    const { events } = readIcsCalendar('BEGIN:VEVENT\r\nDTSTART:20260911T080000\r\nDTEND:20260911T090000\r\nSUMMARY;LANGUAGE=pt-BR:Revisão de\r\n  cálculo\r\nEND:VEVENT\r\n');

    expect(events[0].title).toBe('Revisão de cálculo');
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

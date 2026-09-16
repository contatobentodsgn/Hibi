import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ScheduleBlock } from '../../domain/models';
import { shiftDayKey, todayKey } from '../../domain/date-context';
import { AgendaAvailability } from '../AgendaAvailability';
import { HomeView } from '../HomeView';
import { createSeedData } from '../../data/seed-data';

const vazio = { ...createSeedData(), blocks: [], tasks: [] };

const block = (id: string, day: string, from: string, to: string): ScheduleBlock =>
  ({ id, title: id, start: `${day}T${from}:00`, end: `${day}T${to}:00`, category: 'work' });

describe('AgendaAvailability', () => {
  // O relógio de hoje não pode apagar a manhã de amanhã: com a hora atual valendo para a semana
  // inteira, às 23h a agenda dizia que não sobrava nenhuma janela em nenhum dos sete dias.
  it('corta pela hora atual só o dia de hoje', () => {
    const agora = new Date();
    const hoje = todayKey(agora);
    const amanha = shiftDayKey(hoje, 1);
    const blocos = [block('manhã', amanha, '09:00', '10:00'), block('tarde', amanha, '11:00', '12:00')];

    const markup = renderToStaticMarkup(<AgendaAvailability blocks={blocos} days={[hoje, amanha]} wallClock="23:00" now={agora} />);

    expect(markup).toContain('10:00–11:00');
    expect(markup).not.toContain('No free window remaining');
  });

  it('no dia de hoje, uma janela que já passou não é anunciada', () => {
    const agora = new Date();
    const hoje = todayKey(agora);
    const blocos = [block('manhã', hoje, '09:00', '10:00'), block('tarde', hoje, '11:00', '12:00')];

    const markup = renderToStaticMarkup(<AgendaAvailability blocks={blocos} days={[hoje]} wallClock="16:00" now={agora} />);

    expect(markup).not.toContain('10:00–11:00');
    expect(markup).toContain('No free window remaining');
  });
});

describe('HomeView · a seguir', () => {
  // A lista "UP NEXT" já foi montada à mão na tela, com comparação de texto, em paralelo ao selector.
  // Duas regras para a mesma lista divergem: esta fixa a que vale.
  it('lista só os blocos ainda por vir, sem pausas e sem o bloco em curso', () => {
    const agora = new Date(2026, 8, 14, 9, 30, 0);
    const hoje = todayKey(agora);
    const data = {
      ...vazio,
      blocks: [
        block('Past work', hoje, '08:00', '09:00'),
        block('Current work', hoje, '09:00', '10:00'),
        { ...block('Lunch break', hoje, '12:00', '13:00'), category: 'break' as const },
        block('Later review', hoje, '14:00', '15:00'),
      ],
    };

    const markup = renderToStaticMarkup(<HomeView data={data} onEvent={() => undefined} onNavigate={() => undefined} now={agora} />);
    const aSeguir = markup.slice(markup.indexOf('UP NEXT'));

    expect(aSeguir).toContain('Later review');
    expect(aSeguir).not.toContain('Lunch break');
    expect(aSeguir).not.toContain('Past work');
    expect(aSeguir).not.toContain('Current work');
  });
});

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { countDailyAlerts, nextDelivery } from '../../../electron/focus-gate.mjs';
import { nextOccurrence } from '../../../electron/notifications.mjs';
import { createSeedData } from '../../data/seed-data';
import { buildNotificationEntries } from '../../domain/notifications';
import type { Reminder, StudyData } from '../../domain/models';
import { DEFAULT_FOCUS_SETTINGS, previewDailyAlerts, type FocusSettings } from '../focus-settings';
import { pluralize } from '../../i18n/plural';
import { FocusSettingsPanel } from '../SettingsView';

const pad = (value: number) => String(value).padStart(2, '0');
// Dia local, nunca derivado de toISOString(): em São Paulo isso já seria o dia seguinte depois das 21h.
const todayAt = (time: string) => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${time}:00`;
};

const withReminders = (reminders: Reminder[]): StudyData => ({ ...createSeedData(), tasks: [], reminders, blocks: [], habits: [], goals: [], notes: [], activity: [], telemetry: [] });
const reminder = (id: string, time: string, category: Reminder['category']): Reminder => ({ id, title: id, category, status: 'open', schedule: { at: todayAt(time) } });

describe('prévia de alertas por dia', () => {
  it('é literalmente a mesma função que o agendador usa, com o mesmo nextOccurrence', () => {
    const data = withReminders([reminder('almoço', '12:00', 'wellbeing'), reminder('aula', '13:00', 'important')]);
    const entries = buildNotificationEntries(data);
    const today = new Date();
    const dayStartMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

    expect(previewDailyAlerts(entries, DEFAULT_FOCUS_SETTINGS, today))
      .toBe(countDailyAlerts({ entries, settings: DEFAULT_FOCUS_SETTINGS, dayStartMs, nextOccurrence }));
  });

  // O defeito do app original: o horário ativo dizia 09:00–17:00 e o dia inteiro aparecia mesmo assim.
  it('não conta um lembrete de bem-estar fora do horário ativo, e conta o importante', () => {
    const entries = buildNotificationEntries(withReminders([reminder('água', '22:00', 'wellbeing')]));
    expect(previewDailyAlerts(entries, DEFAULT_FOCUS_SETTINGS)).toBe(0);

    const urgent = buildNotificationEntries(withReminders([reminder('remédio', '22:00', 'important')]));
    expect(previewDailyAlerts(urgent, DEFAULT_FOCUS_SETTINGS)).toBe(1);
  });

  // Três lembretes colados no fim do horário ativo. No preset "saúde" os três cabem; no "calmo" o
  // intervalo de 90 minutos empurra os dois últimos para depois das 17:00, e eles passam a contar no
  // dia seguinte — adiados, nunca descartados.
  it('o preset muda a prévia, porque a prévia é o próprio portão', () => {
    const entries = buildNotificationEntries(withReminders([
      reminder('alongar', '16:00', 'wellbeing'),
      reminder('beber', '16:10', 'wellbeing'),
      reminder('respirar', '16:20', 'wellbeing'),
    ]));

    expect(previewDailyAlerts(entries, { ...DEFAULT_FOCUS_SETTINGS, nudgePreset: 'wellbeing' })).toBe(3);
    expect(previewDailyAlerts(entries, { ...DEFAULT_FOCUS_SETTINGS, nudgePreset: 'calm' })).toBe(1);
  });

  it('concorda com nextDelivery entrada por entrada, e não por coincidência', () => {
    const settings = DEFAULT_FOCUS_SETTINGS;
    const entry = { kind: 'reminder' as const, category: 'wellbeing' as const };
    const dawn = new Date(2026, 8, 11, 7, 30).getTime();

    expect(nextDelivery(entry, dawn, { settings })).toBe(new Date(2026, 8, 11, 9, 0).getTime());
  });
});

describe('Ajustes › Foco', () => {
  const panel = (data: StudyData) => renderToStaticMarkup(<FocusSettingsPanel settings={DEFAULT_FOCUS_SETTINGS} data={data} onEvent={() => undefined} />);

  it('oferece controles de verdade, não um valor só de leitura', () => {
    const markup = panel(withReminders([]));

    expect(markup).toContain('<select');
    expect(markup).toContain('type="time"');
    expect(markup).toContain('Duração da sessão');
    expect(markup).toContain('Horário ativo');
    expect(markup).toContain('Intensidade dos lembretes');
    expect(markup).toContain('Alertas por dia');
    // O que a tela promete é o que o portão cumpre.
    expect(markup).toContain('ficam quietos durante o foco');
  });

  // `after 1 minutes` é o defeito do original, citado nas duas auditorias.
  it('nunca renderiza um plural quebrado', () => {
    const markup = panel(withReminders([reminder('aula', '13:00', 'important')]));

    expect(markup).toContain('1 alerta');
    expect(markup).not.toContain('1 alertas');
    expect(markup).not.toMatch(/\b1 minutos\b/);
    expect(markup).not.toMatch(/\b1 minutes\b/);
  });
});

describe('Ajustes › Foco › presença', () => {
  const panelWith = (settings: FocusSettings) => renderToStaticMarkup(<FocusSettingsPanel settings={settings} data={withReminders([])} onEvent={() => undefined} />);

  it('mostra os quatro ajustes, cada um dizendo a consequência', () => {
    const markup = panelWith(DEFAULT_FOCUS_SETTINGS);

    expect(markup).toContain('aria-label="Tempo de inatividade"');
    expect(markup).toContain('aria-label="Quando você se afastar"');
    expect(markup).toContain('aria-label="Animação durante o foco"');
    expect(markup).toContain('aria-label="Tempo limite da tela do mascote"');
    expect(markup).toContain('Perguntar se ainda estou aqui');
    expect(markup).toContain('Pausar e não contar o tempo ausente');
    expect(markup).toContain('Continuar contando, inclusive o tempo ausente');
    expect(markup).toContain('Ouvindo música');
    // A prévia de alertas continua lá, ao lado dos ajustes novos.
    expect(markup).toContain('Alertas por dia');
  });

  // O timeout de tela não tem o que governar neste Mac: a tela precisa dizer isso sem ambiguidade.
  it('diz que o timeout de tela só vale com o mascote conectado, e que ele não está', () => {
    const markup = panelWith(DEFAULT_FOCUS_SETTINGS);

    expect(markup).toContain('Esta opção se aplica ao mascote conectado. Neste Mac');
    expect(markup).toContain('Mascote não conectado');
  });

  // `after 1 minutes` é o defeito do original.
  it('pluraliza as durações das opções', () => {
    const markup = panelWith(DEFAULT_FOCUS_SETTINGS);

    expect(markup).toContain('Depois de 1 minuto parado');
    expect(markup).toContain('Depois de 5 minutos parado');
    expect(markup).toContain('Apagar a tela depois de 30 segundos');
    expect(markup).toContain('Apagar a tela depois de 1 minuto<');
    expect(markup).not.toMatch(/\b1 minutos\b/);
  });

  it('com "Continuar contando", o tempo de inatividade fica desligado e diz por quê', () => {
    expect(panelWith({ ...DEFAULT_FOCUS_SETTINGS, awayBehavior: 'keep' })).toMatch(/<select aria-label="Tempo de inatividade" disabled=""/);
    expect(panelWith({ ...DEFAULT_FOCUS_SETTINGS, awayBehavior: 'keep' })).toContain('Sem efeito enquanto “Continuar contando” estiver escolhido');
    expect(panelWith({ ...DEFAULT_FOCUS_SETTINGS, awayBehavior: 'ask' })).not.toMatch(/<select aria-label="Tempo de inatividade" disabled=""/);
  });
});

describe('pluralização', () => {
  it('trata segundos como os minutos, nos dois idiomas', () => {
    expect(pluralize('pt', 1, 'focus.count.second.one', 'focus.count.second.other')).toBe('1 segundo');
    expect(pluralize('pt', 30, 'focus.count.second.one', 'focus.count.second.other')).toBe('30 segundos');
    expect(pluralize('en', 1, 'focus.count.second.one', 'focus.count.second.other')).toBe('1 second');
    expect(pluralize('en', 30, 'focus.count.second.one', 'focus.count.second.other')).toBe('30 seconds');
  });

  it('trata o 1 como singular e todo o resto como plural, nos dois idiomas', () => {
    expect(pluralize('en', 1, 'focus.count.minute.one', 'focus.count.minute.other')).toBe('1 minute');
    expect(pluralize('en', 25, 'focus.count.minute.one', 'focus.count.minute.other')).toBe('25 minutes');
    expect(pluralize('pt', 1, 'focus.count.minute.one', 'focus.count.minute.other')).toBe('1 minuto');
    expect(pluralize('pt', 0, 'focus.count.minute.one', 'focus.count.minute.other')).toBe('0 minutos');
    expect(pluralize('pt', 1, 'focus.count.alert.one', 'focus.count.alert.other')).toBe('1 alerta');
  });
});

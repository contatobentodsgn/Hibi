import { describe, expect, it } from 'vitest';
import { translate, type DictionaryKey } from '../../i18n/dictionary';
import { disconnectedPreference, fillDisplay, notchDisplayOptions, notchTestMessage, selectedNotchValue, type NotchDisplay, type NotchDisplayState } from '../notch-display';

const pt = (key: DictionaryKey) => translate('pt', key);
const en = (key: DictionaryKey) => translate('en', key);
const internal: NotchDisplay = { id: 1, label: 'Color LCD', primary: false, internal: true, hasCameraHousing: true, width: 1512, height: 982 };
const lg: NotchDisplay = { id: 2, label: 'LG ULTRAWIDE', primary: true, internal: false, hasCameraHousing: false, width: 2560, height: 1080 };

describe('opções do monitor do notch', () => {
  it('automático mostra o monitor resolvido e cada monitor ganha seus sufixos', () => {
    const state: NotchDisplayState = { preference: { displayId: null, displayLabel: '' }, resolvedDisplayId: 1, reason: 'camera-housing', displays: [lg, internal] };
    expect(selectedNotchValue(state)).toBe('auto');
    expect(disconnectedPreference(state)).toBe(false);
    expect(notchDisplayOptions(state, pt)).toEqual([
      { value: 'auto', label: 'Automático · Color LCD', disabled: false },
      { value: '2', label: 'LG ULTRAWIDE · principal', disabled: false },
      { value: '1', label: 'Color LCD · com notch', disabled: false },
    ]);
    expect(notchDisplayOptions(state, en)[1]).toEqual({ value: '2', label: 'LG ULTRAWIDE · primary', disabled: false });
  });

  it('preferência desconectada vira opção desabilitada e selecionada', () => {
    const state: NotchDisplayState = { preference: { displayId: 9, displayLabel: 'Studio Display' }, resolvedDisplayId: 1, reason: 'camera-housing', displays: [internal] };
    expect(disconnectedPreference(state)).toBe(true);
    expect(selectedNotchValue(state)).toBe('9');
    expect(notchDisplayOptions(state, pt).at(-1)).toEqual({ value: '9', label: 'Studio Display · desconectado', disabled: true });
  });

  it('preferência desconectada sem rótulo usa "monitor desconhecido"', () => {
    const state: NotchDisplayState = { preference: { displayId: 9, displayLabel: '' }, resolvedDisplayId: 1, reason: 'camera-housing', displays: [internal] };
    expect(notchDisplayOptions(state, pt).at(-1)?.label).toBe('monitor desconhecido · desconectado');
  });
});

describe('mensagem do teste do notch', () => {
  it('traz o monitor nas mensagens que dependem dele, em pt e en', () => {
    expect(notchTestMessage({ outcome: 'confirmed', displayId: 2, displayLabel: 'LG ULTRAWIDE' }, pt)).toBe('Confirmado pelo notch em LG ULTRAWIDE.');
    expect(notchTestMessage({ outcome: 'declined', displayId: 2, displayLabel: 'LG ULTRAWIDE' }, pt)).toBe('Você indicou que o cartão não apareceu em LG ULTRAWIDE.');
    expect(notchTestMessage({ outcome: 'timeout', displayId: 2, displayLabel: 'LG ULTRAWIDE' }, en)).toBe('No answer in 20 s. The card may not have appeared on LG ULTRAWIDE.');
    expect(notchTestMessage({ outcome: 'declined', displayId: 1, displayLabel: '' }, pt)).toBe('Você indicou que o cartão não apareceu em monitor desconhecido.');
  });

  it('usa as mensagens fixas de ocupado, interrompido e falha', () => {
    expect(notchTestMessage({ outcome: 'busy', displayId: null, displayLabel: '' }, pt)).toBe('Há uma confirmação pendente no notch. Responda a ela e teste de novo.');
    expect(notchTestMessage({ outcome: 'interrupted', displayId: 2, displayLabel: 'LG ULTRAWIDE' }, pt)).toBe('O teste foi interrompido por outro aviso do mascote.');
    expect(notchTestMessage({ outcome: 'failed', displayId: null, displayLabel: '' }, en)).toBe('Could not show the test in the notch.');
  });
});

describe('preenchimento do nome do monitor', () => {
  it('insere o nome literalmente, mesmo com padrões especiais de replace', () => {
    expect(fillDisplay('O notch usa {display} até ele voltar.', 'Monitor $& $\' $$')).toBe('O notch usa Monitor $& $\' $$ até ele voltar.');
    expect(notchTestMessage({ outcome: 'confirmed', displayId: 3, displayLabel: 'Sala $&' }, pt)).toBe('Confirmado pelo notch em Sala $&.');
  });
});

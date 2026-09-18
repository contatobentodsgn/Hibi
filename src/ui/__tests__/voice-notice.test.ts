import { describe, expect, it } from 'vitest';
import { voiceNotice } from '../voice-notice';

const t = (key: string) => `[${key}]`;

describe('voiceNotice', () => {
  // Antes, terminar bem — ou clicar em "Parar voz" — mostrava que a voz não existia.
  it('uma escuta que termina bem não deixa aviso nenhum', () => {
    expect(voiceNotice({ status: 'ready', error: null, reason: null }, t)).toBe('');
  });

  it('cada motivo do helper vira um texto que diz o que fazer', () => {
    expect(voiceNotice({ status: 'error', error: 'Speech recognition permission denied', reason: 'permission' }, t)).toBe('[voice.error.permission]');
    expect(voiceNotice({ status: 'error', error: 'On-device…', reason: 'no-on-device' }, t)).toBe('[voice.error.noOnDevice]');
    expect(voiceNotice({ status: 'error', error: 'Nenhuma entrada…', reason: 'no-microphone' }, t)).toBe('[voice.error.noMicrophone]');
  });

  it('um erro sem motivo conhecido mostra a mensagem em vez de esconder', () => {
    expect(voiceNotice({ status: 'error', error: 'algo inesperado', reason: 'failed' }, t)).toBe('algo inesperado');
  });

  it('sem a ponte, ou com a voz indisponível, diz onde a voz existe', () => {
    expect(voiceNotice(null, t)).toBe('[taby.voice.unavailable]');
    expect(voiceNotice({ status: 'unavailable', error: 'x' }, t)).toBe('[taby.voice.unavailable]');
  });
});

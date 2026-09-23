import { describe, expect, it } from 'vitest';
import { downloadPercent, formatModelSize, modelPurposeKey, modelStatusKey } from '../local-model-format';

describe('formatModelSize', () => {
  it('mostra gigabytes com uma casa, e não bytes crus', () => {
    expect(formatModelSize(1834426016)).toBe('1.7 GB');
    expect(formatModelSize(52 * 1024 * 1024)).toBe('52 MB');
    expect(formatModelSize(4096)).toBe('4 KB');
  });

  it('um tamanho ausente ou absurdo vira travessão, em vez de NaN na tela', () => {
    expect(formatModelSize(undefined)).toBe('—');
    expect(formatModelSize(0)).toBe('—');
    expect(formatModelSize(Number.NaN)).toBe('—');
  });
});

describe('modelStatusKey', () => {
  it('dá um texto próprio a cada estado, porque cada um leva a uma ação diferente', () => {
    expect(modelStatusKey('ready')).toBe('data.model.status.ready');
    expect(modelStatusKey('missing')).toBe('data.model.status.missing');
    expect(modelStatusKey('unverified')).toBe('data.model.status.unverified');
    expect(modelStatusKey('unavailable')).toBe('data.model.status.unavailable');
  });
});

describe('modelPurposeKey', () => {
  it('diz o que muda para o Assistant em cada estado, e nunca promete respostas sem modelo conferido', () => {
    expect(modelPurposeKey('ready')).toBe('data.model.purpose.ready');
    expect(modelPurposeKey('unverified')).toBe('data.model.purpose.unverified');
    expect(modelPurposeKey('missing')).toBe('data.model.purpose.missing');
    expect(modelPurposeKey('unavailable')).toBe('data.model.purpose.missing');
  });
});

describe('downloadPercent', () => {
  it('conta só enquanto baixa, e nunca passa de cem', () => {
    expect(downloadPercent({ status: 'downloading', receivedBytes: 917213008, totalBytes: 1834426016, error: null })).toBe(50);
    expect(downloadPercent({ status: 'downloading', receivedBytes: 1834426016, totalBytes: 1834426016, error: null })).toBe(100);
    // Um servidor que manda mais do que declarou não vira 143% na barra.
    expect(downloadPercent({ status: 'downloading', receivedBytes: 99, totalBytes: 10, error: null })).toBe(100);
  });

  it('sem download em curso, ou sem total conhecido, não há barra', () => {
    expect(downloadPercent(null)).toBe(null);
    expect(downloadPercent({ status: 'ready', receivedBytes: 10, totalBytes: 10, error: null })).toBe(null);
    expect(downloadPercent({ status: 'downloading', receivedBytes: 10, totalBytes: 0, error: null })).toBe(null);
  });
});

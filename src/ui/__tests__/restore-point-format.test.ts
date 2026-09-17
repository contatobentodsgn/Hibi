import { describe, expect, it } from 'vitest';
import { translate, type DictionaryKey } from '../../i18n/dictionary';
import { WORKSPACE_RESTORE_POINT_KEYS, type WorkspaceRestorePoint } from '../../data/workspace-store';
import { restorePointDate, restorePointSize, restorePointText, restorePointsEmptyKey } from '../restore-point-format';

const point = (label: string): WorkspaceRestorePoint => ({ id: 1, label, createdAt: '2026-06-15T12:00:00.000Z', bytes: 10 });
const pt = (key: DictionaryKey) => translate('pt', key);
const en = (key: DictionaryKey) => translate('en', key);
// Um tradutor que marca o que recebeu: se o rótulo cru passar por ele, a marca aparece no resultado.
const shouting = (key: DictionaryKey) => `TRANSLATED:${key}`;

describe('restorePointText', () => {
  it('traduz o rótulo novo, que é a chave do dicionário', () => {
    expect(restorePointText(point(WORKSPACE_RESTORE_POINT_KEYS.beforeReset), pt)).toBe('Antes de apagar todos os dados');
    expect(restorePointText(point(WORKSPACE_RESTORE_POINT_KEYS.beforeReset), en)).toBe('Before wiping all data');
  });

  it('reconhece a frase que as versões anteriores gravaram e traduz igual', () => {
    expect(restorePointText(point('antes de restaurar um backup'), pt)).toBe(pt(WORKSPACE_RESTORE_POINT_KEYS.beforeRestore));
    expect(restorePointText(point('Migração do armazenamento local'), en)).toBe(en(WORKSPACE_RESTORE_POINT_KEYS.migration));
  });

  it('mostra o rótulo desconhecido como veio, sem passar pelo dicionário', () => {
    expect(restorePointText(point('ponto gravado por uma versão futura'), shouting)).toBe('ponto gravado por uma versão futura');
  });
});

describe('restorePointSize', () => {
  it('conta em B abaixo de 1 KB', () => {
    expect(restorePointSize(0)).toBe('0 B');
    expect(restorePointSize(1023)).toBe('1023 B');
  });

  it('conta em KB até 1 MB', () => {
    expect(restorePointSize(1024)).toBe('1 KB');
    expect(restorePointSize(1024 * 1024 - 1)).toBe('1024 KB');
  });

  it('conta em MB acima disso, com uma casa', () => {
    expect(restorePointSize(1024 * 1024)).toBe('1.0 MB');
    expect(restorePointSize(1024 * 1024 * 3.25)).toBe('3.3 MB');
  });
});

describe('restorePointDate', () => {
  it('devolve o valor cru quando o carimbo não é uma data', () => {
    expect(restorePointDate('nem data nem nada', 'pt')).toBe('nem data nem nada');
    expect(restorePointDate('', 'en')).toBe('');
  });

  it('formata um carimbo válido no idioma da interface', () => {
    const iso = '2026-06-15T12:00:00.000Z';
    const inPt = restorePointDate(iso, 'pt');
    const inEn = restorePointDate(iso, 'en');
    // Sem afirmar a hora: a suíte roda em São Paulo e em Kiritimati, e o dia muda entre os dois.
    expect(inPt).toContain('2026');
    expect(inEn).toContain('2026');
    expect(inPt).not.toBe(iso);
    expect(inPt).not.toBe(inEn);
  });
});

describe('restorePointsEmptyKey', () => {
  it('sem a ponte, diz que os pontos ficam no app de desktop', () => {
    expect(restorePointsEmptyKey(undefined)).toBe('data.restorePoints.desktopOnly');
    expect(restorePointsEmptyKey({})).toBe('data.restorePoints.desktopOnly');
    expect(restorePointsEmptyKey({ listWorkspaceRestorePoints: 'quase uma função' })).toBe('data.restorePoints.desktopOnly');
  });

  it('com a ponte, a lista vazia é "ainda não houve nenhum" e não manda abrir o app já aberto', () => {
    const key = restorePointsEmptyKey({ listWorkspaceRestorePoints: () => Promise.resolve([]) });
    expect(key).toBe('data.restorePoints.empty');
    expect(pt(key)).not.toContain('desktop');
    expect(en(key)).not.toContain('desktop');
  });
});

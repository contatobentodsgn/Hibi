import { describe, expect, it } from 'vitest';
import { normalizePortuguese, wordsToNumber } from '../ptbr-normalizer';
import { normalizeSpokenCommand, parseSpokenTime } from '../spoken-command';

describe('wordsToNumber', () => {
  it('lê números por extenso', () => {
    expect(wordsToNumber('mil duzentos e quarenta')).toBe(1240);
    expect(wordsToNumber('vinte e cinco')).toBe(25);
    expect(wordsToNumber('cento e dez')).toBe(110);
    expect(wordsToNumber('dois mil e trezentos')).toBe(2300);
    expect(wordsToNumber('cem')).toBe(100);
    expect(wordsToNumber('quinze reais')).toBeNull();
  });
});

describe('normalizePortuguese', () => {
  it('valores em reais viram dígitos', () => {
    expect(normalizePortuguese('eu gastei mil duzentos e quarenta reais no mercado hoje')).toBe('eu gastei R$ 1.240 no mercado hoje');
    expect(normalizePortuguese('custou um real')).toBe('custou R$ 1');
  });

  it('o dia do mês vira número, para o Taby achar a data', () => {
    expect(normalizePortuguese('marca dentista dia vinte e cinco às 15h')).toBe('marca dentista dia 25 às 15h');
    expect(normalizePortuguese('o dia quarenta')).toBe('o dia quarenta');
  });

  it('"bom dia" ouvido no lugar de "adia" volta a ser "adia" só num pedido de mudar de horário', () => {
    expect(normalizePortuguese('Bom dia minha reunião com a Cristiane para as 4h30')).toBe('adia minha reunião com a Cristiane para as 4h30');
    expect(normalizePortuguese('Bom dia, minha reunião foi ótima')).toBe('Bom dia, minha reunião foi ótima');
    expect(normalizePortuguese('bom dia Taby')).toBe('bom dia Taby');
  });

  it('não mexe no resto', () => {
    const frase = 'crie uma tarefa revisar o carrossel da Marina';
    expect(normalizePortuguese(frase)).toBe(frase);
  });

  it('entra no caminho dos comandos ditos', () => {
    expect(normalizeSpokenCommand('Marque uma reunião dia vinte e cinco às 15h.')).toBe('Marque uma reunião dia 25 às 15h');
  });
});

describe('horário sem período', () => {
  it('de 1 a 6 é à tarde', () => {
    expect(parseSpokenTime('4h30')).toBe('16:30');
    expect(parseSpokenTime('quatro e meia')).toBe('16:30');
    expect(parseSpokenTime('às 3')).toBe('15:00');
    expect(parseSpokenTime('6h')).toBe('18:00');
  });

  it('com período, com zero na frente ou de 7 em diante, fica como foi dito', () => {
    expect(parseSpokenTime('4 da madrugada')).toBe('04:00');
    expect(parseSpokenTime('04:30')).toBe('04:30');
    expect(parseSpokenTime('7h')).toBe('07:00');
    expect(parseSpokenTime('9h')).toBe('09:00');
    expect(parseSpokenTime('meia-noite')).toBe('00:00');
  });
});

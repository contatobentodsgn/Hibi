/**
 * O português falado, arrumado antes de o Assistant ler o pedido.
 *
 * O reconhecedor escreve números por extenso ("mil duzentos e quarenta reais", "dia vinte e cinco") e às
 * vezes troca uma palavra por outra que soa parecido no começo da frase ("Bom dia minha reunião…" no lugar
 * de "Adia minha reunião…"). O resto do Assistant entende dígitos e o verbo certo; aqui se faz a ponte, sem
 * mexer em nada que não seja um desses casos.
 */

const UNITS: Record<string, number> = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, 'três': 3, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9,
  dez: 10, onze: 11, doze: 12, treze: 13, catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19,
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90,
  cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300, quatrocentos: 400, quatrocentas: 400,
  quinhentos: 500, quinhentas: 500, seiscentos: 600, seiscentas: 600, setecentos: 700, setecentas: 700,
  oitocentos: 800, oitocentas: 800, novecentos: 900, novecentas: 900,
};
const NUMBER_WORD = `(?:${[...Object.keys(UNITS), 'mil'].sort((a, b) => b.length - a.length).join('|')})`;
// Uma sequência de números por extenso, com "e" entre eles: "mil duzentos e quarenta", "vinte e cinco".
const NUMBER_RUN = `${NUMBER_WORD}(?:\\s+(?:e\\s+)?${NUMBER_WORD})*`;

/** "mil duzentos e quarenta" → 1240. `null` quando não é um número inteiro dito por extenso. */
export function wordsToNumber(text: string): number | null {
  const words = text.toLocaleLowerCase('pt-BR').trim().split(/\s+/u).filter((word) => word !== 'e');
  if (words.length === 0) return null;
  let total = 0;
  let current = 0;
  for (const word of words) {
    if (word === 'mil') { total += (current || 1) * 1000; current = 0; continue; }
    const value = UNITS[word];
    if (value === undefined) return null;
    current += value;
  }
  return total + current;
}

const thousands = (value: number) => String(value).replace(/\B(?=(\d{3})+(?!\d))/gu, '.');

const MONEY = new RegExp(`(?<![\\p{L}])(${NUMBER_RUN})\\s+(reais|real)(?![\\p{L}])`, 'giu');
const DAY = new RegExp(`(?<![\\p{L}])(dia)\\s+(${NUMBER_RUN})(?![\\p{L}])`, 'giu');
// "Bom dia minha reunião com a Ana para as 16h": o reconhecedor ouviu "adia" como "bom dia". Só vale
// quando o resto é um pedido de mudar algo de horário — "bom dia, minha reunião foi ótima" fica como está.
const MISHEARD_POSTPONE = /^bom\s+dia[,!]?\s+((?:a\s+)?(?:minha|meu)\s.+\s(?:para|pra|pro)\s.+)$/iu;

export function normalizePortuguese(text: string): string {
  return text
    .replace(MISHEARD_POSTPONE, 'adia $1')
    .replace(MONEY, (whole, number: string) => { const value = wordsToNumber(number); return value === null ? whole : `R$ ${thousands(value)}`; })
    .replace(DAY, (whole, word: string, number: string) => { const value = wordsToNumber(number); return value === null || value < 1 || value > 31 ? whole : `${word} ${value}`; });
}

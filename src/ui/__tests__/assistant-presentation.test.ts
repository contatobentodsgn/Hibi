import { describe, expect, it } from 'vitest';
import { companionEventFor, notchTextFor, readingTimeMs } from '../assistant-presentation';

describe('readingTimeMs', () => {
  // Eram 4 segundos fixos: tempo de piscar, não de ler duas a quatro frases.
  it('dá tempo de ler, com piso para respostas curtas', () => {
    expect(readingTimeMs('Pronto.')).toBe(8_000);
    // Uma resposta de três frases do cérebro offline passa bem do piso.
    expect(readingTimeMs('Use a técnica de 25 minutos e faça pausas curtas entre elas. Depois de quatro ciclos, tire um descanso maior. Anote o que ficou pendente antes de parar.')).toBeGreaterThan(12_000);
  });

  it('não deixa o notch virar cartaz permanente', () => {
    expect(readingTimeMs('t'.repeat(5_000))).toBe(45_000);
  });

  it('cresce com o tamanho do texto', () => {
    expect(readingTimeMs('a'.repeat(300))).toBeGreaterThan(readingTimeMs('a'.repeat(100)));
  });
});

describe('notchTextFor', () => {
  it('deixa passar o que cabe, sem mexer', () => {
    expect(notchTextFor('Respire fundo.')).toBe('Respire fundo.');
  });

  it('corta no fim de uma frase, e não no meio de uma palavra', () => {
    const resposta = 'Primeira frase completa aqui. Segunda frase que ainda cabe. Terceira frase que já não cabe de jeito nenhum neste cartão.';

    const cartao = notchTextFor(resposta, 70);

    expect(cartao.endsWith('.')).toBe(true);
    expect(resposta.startsWith(cartao)).toBe(true);
    expect(cartao.length).toBeLessThanOrEqual(70);
  });

  it('sem frase para cortar, termina em reticências em vez de cortar seco', () => {
    expect(notchTextFor('palavra '.repeat(40), 40).endsWith('…')).toBe(true);
  });

  it('junta quebras de linha, porque o cartão é uma faixa e não uma página', () => {
    expect(notchTextFor('linha um\n\nlinha dois')).toBe('linha um linha dois');
  });
});

describe('companionEventFor', () => {
  it('a resposta leva o texto do cartão e o tempo de leitura dele', () => {
    const evento = companionEventFor('result', 'r1', 'Uma resposta curta.', 1_000);

    expect(evento).toMatchObject({ type: 'ai.result', requestId: 'r1', text: 'Uma resposta curta.', expiresInMs: 8_000 });
  });

  it('uma resposta longa aparece cortada no cartão, e o tempo acompanha o que ficou', () => {
    const longa = 'Frase completa para caber. '.repeat(40);

    const evento = companionEventFor('result', 'r1', longa, 1_000) as { text: string; expiresInMs: number };

    expect(evento.text.length).toBeLessThanOrEqual(221);
    expect(evento.expiresInMs).toBe(readingTimeMs(evento.text));
  });
});

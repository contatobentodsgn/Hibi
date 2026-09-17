import { useEffect, useRef } from 'react';

/**
 * Liga o atalho global à navegação.
 *
 * A assinatura é feita uma vez e guarda a função mais recente numa referência: a rota muda a cada
 * pintura, e reassinar a cada uma acumularia ouvintes — um toque abriria o Taby várias vezes.
 */
export function useTabyShortcut(onSummon: () => void) {
  const latest = useRef(onSummon);
  latest.current = onSummon;
  useEffect(() => {
    const subscribe = typeof window === 'undefined' ? undefined : window.hibiDesktop?.onTabyShortcut;
    return subscribe?.(() => latest.current()) ?? (() => undefined);
  }, []);
}

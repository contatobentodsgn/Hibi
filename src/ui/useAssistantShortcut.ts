import { useEffect, useRef } from 'react';

/**
 * Liga o atalho global à navegação.
 *
 * A assinatura é feita uma vez e guarda a função mais recente numa referência: a rota muda a cada
 * pintura, e reassinar a cada uma acumularia ouvintes — um toque abriria o Assistant várias vezes.
 */
export type AssistantShortcutRequest = Readonly<{ listen: boolean; background: boolean }>;

export function useAssistantShortcut(onSummon: (request?: AssistantShortcutRequest) => void) {
  const latest = useRef(onSummon);
  latest.current = onSummon;
  useEffect(() => {
    const subscribe = typeof window === 'undefined' ? undefined : window.pixanoDesktop?.onAssistantShortcut;
    return subscribe?.((request) => latest.current(request)) ?? (() => undefined);
  }, []);
}

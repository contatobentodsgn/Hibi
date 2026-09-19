import { useSyncExternalStore } from 'react';

// Abaixo desta largura, painéis laterais sobem de baixo, na largura toda (a matriz web do plano vai até 390 px).
const NARROW_QUERY = '(max-width: 640px)';

const subscribe = (onChange: () => void) => {
  if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
  const media = window.matchMedia(NARROW_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
};
const snapshot = () => typeof window !== 'undefined' && window.matchMedia?.(NARROW_QUERY).matches === true;

/** Se a janela está estreita: sem `matchMedia` (servidor e testes), não. */
export const useNarrowWindow = () => useSyncExternalStore(subscribe, snapshot, () => false);

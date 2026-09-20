import type { ReactNode } from 'react';

export type HibiTagTone = 'neutral' | 'lavender' | 'blue' | 'peach' | 'mint';

/**
 * A etiqueta pastel do preview aprovado ("A seguir · 10:00", "Design", "+12%"): um tom da paleta dele e,
 * opcionalmente, o pontinho de status. Não confundir com o `Chip` do HeroUI, que tem as cores de estado
 * (sucesso, aviso, erro) e não as do preview.
 */
export function HibiTag({ tone = 'neutral', dot = false, children }: Readonly<{ tone?: HibiTagTone; dot?: boolean; children: ReactNode }>) {
  return (
    <span className={tone === 'neutral' ? 'hibi-tag' : `hibi-tag hibi-tag--${tone}`}>
      {dot && <span className="hibi-tag__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

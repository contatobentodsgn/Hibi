import { useState, type HTMLAttributes, type ReactNode } from 'react';
import { UNSAFE_PortalProvider } from 'react-aria';

type HibiUiRootProps = Readonly<{ children: ReactNode }> & Omit<HTMLAttributes<HTMLDivElement>, 'children'>;

/**
 * A raiz de toda superfície da nova UI. Os tokens (`src/ui/redesign/theme.css`) e as regras do HeroUI valem
 * só dentro de `.hibi-ui`, e é aqui que os popovers, menus e diálogos do HeroUI são desenhados: sem o
 * `UNSAFE_PortalProvider`, o React Aria os poria no `body`, fora dessas regras (sem cor, borda nem tema).
 *
 * A raiz não pode cortar nem transformar o que tem dentro (`overflow: hidden`, `transform`): os diálogos
 * usam posição fixa em relação à janela e seriam recortados.
 */
export function HibiUiRoot({ children, className, ...rest }: HibiUiRootProps) {
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  return (
    <div {...rest} className={className ? `hibi-ui ${className}` : 'hibi-ui'}>
      <UNSAFE_PortalProvider getContainer={() => portal ?? document.body}>{children}</UNSAFE_PortalProvider>
      <div ref={setPortal} data-hibi-portal="" />
    </div>
  );
}

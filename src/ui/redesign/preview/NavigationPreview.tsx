import { useState } from 'react';
import { AppShell } from '../../shell/AppShell';
import type { NotchPosition } from '../../shell/AdaptiveNotchNavigation';
import type { NavKey } from '../../shell/routes';

/**
 * Só em desenvolvimento (`?overlay=ui-navigation`, com `&position=bottom` para a barra embaixo): o shell oficial
 * sem as telas, para comparar com as capturas do preview aprovado e para o e2e da posição inferior, que só
 * ganha uma preferência na U04.
 */
export function NavigationPreview() {
  const position: NotchPosition = new URLSearchParams(location.search).get('position') === 'bottom' ? 'bottom' : 'top';
  const [route, setRoute] = useState<NavKey>('home');
  const [commands, setCommands] = useState(0);

  return (
    <AppShell active={route} onNavigate={setRoute} onOpenCommands={() => setCommands((count) => count + 1)} position={position}>
      {/* Conteúdo alto, com a última linha colada no fim: é ela que não pode ficar sob a barra. */}
      <div className="legacy-surface" data-navigation-preview={route} data-commands-opened={commands}>
        <div style={{ padding: '32px 32px 0' }}>
          <p style={{ margin: 0 }}>Rota atual: {route}</p>
          <div style={{ height: 1500 }} />
          <p data-last-line="" style={{ margin: 0 }}>Última linha</p>
        </div>
      </div>
    </AppShell>
  );
}

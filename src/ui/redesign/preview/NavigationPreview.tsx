import { useState } from 'react';
import { AppShell } from '../../shell/AppShell';
import type { NotchPosition } from '../../shell/AdaptiveNotchNavigation';
import type { NavKey } from '../../shell/routes';
import { AppearanceSettings } from '../settings/AppearanceSettings';

/**
 * Só em desenvolvimento (`?overlay=ui-navigation`): o shell oficial sem as telas, para comparar com as capturas
 * do preview aprovado. `&position=bottom` (ou `top`) fixa a posição da barra; sem o parâmetro, vale a preferência
 * da Aparência, que está na própria página, ao lado de um rascunho: trocar tema ou posição não pode apagá-lo.
 */
export function NavigationPreview() {
  const forced = new URLSearchParams(location.search).get('position');
  const position: NotchPosition | undefined = forced === 'bottom' || forced === 'top' ? forced : undefined;
  const [route, setRoute] = useState<NavKey>('home');
  const [commands, setCommands] = useState(0);

  return (
    <AppShell active={route} onNavigate={setRoute} onOpenCommands={() => setCommands((count) => count + 1)} position={position}>
      {/* Conteúdo alto, com a última linha colada no fim: é ela que não pode ficar sob a barra. */}
      <div className="legacy-surface" data-navigation-preview={route} data-commands-opened={commands}>
        <div style={{ padding: '32px 32px 0' }}>
          <p style={{ margin: 0 }}>Rota atual: {route}</p>
          <label style={{ display: 'grid', gap: 6, maxWidth: 420, marginTop: 16 }}>
            Rascunho
            <textarea aria-label="Rascunho" rows={3} />
          </label>
          {/* 770 px de cartão, como a coluna de Ajustes do preview, mais os 24 px da base de cada lado. */}
          <div style={{ maxWidth: 818, marginTop: 24 }}><AppearanceSettings onEvent={() => undefined} framed /></div>
          <div style={{ height: 1500 }} />
          <p data-last-line="" style={{ margin: 0 }}>Última linha</p>
        </div>
      </div>
    </AppShell>
  );
}

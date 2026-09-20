import { useT } from '../../i18n/LocaleProvider';
import { HibiUiRoot } from '../redesign/components/HibiUiRoot';
import { breadcrumbFor, type NavKey } from './routes';

/**
 * A faixa do topo da área de trabalho do preview (`.topbar`, 79 px, com a trilha "Meu espaço / Hoje"). O selo
 * "Preview visual" e o botão de ajuda eram do preview e ficaram de fora. Quando a rota mora dentro de um
 * destino, a trilha mostra os dois: "Meu espaço / Tarefas / Lembretes".
 */
export function ShellTopbar({ active }: Readonly<{ active: NavKey }>) {
  const t = useT();
  const trail = breadcrumbFor(active);

  return (
    <HibiUiRoot className="shell-topbar-root shrink-0">
      <header className="hibi-topbar flex h-[79px] items-center gap-4 border-b border-(--hibi-line) px-[42px] max-[1180px]:px-[27px] max-[820px]:px-[21px]">
        <nav aria-label={t('redesign.shell.breadcrumb')} className="text-[12px] text-(--hibi-ink-muted)">
          <ol>
            <li className="inline">{t('redesign.shell.workspace')}</li>
            {trail.map((key, index) => (
              <li key={key} className="inline">
                {' '}
                <span aria-hidden="true" className="mx-3.5 opacity-50">/</span>{' '}
                {index === trail.length - 1 ? <strong aria-current="page" className="font-medium text-(--hibi-ink)">{t(key)}</strong> : t(key)}
              </li>
            ))}
          </ol>
        </nav>
      </header>
    </HibiUiRoot>
  );
}

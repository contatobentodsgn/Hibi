import { Description, Dropdown, Focusable, Tooltip } from '@heroui/react';
import { Check, MoreHorizontal, Search, Settings2 } from 'lucide-react';
import { useT } from '../../i18n/LocaleProvider';
import { ariaCurrentFor, destinationFor, MORE_ITEMS, type NavKey } from './routes';

type Props = Readonly<{ active: NavKey; onNavigate: (key: NavKey) => void; onOpenCommands: () => void }>;

// O `.notch-action` do preview (ícone de 16 px, texto de 12 px, 34 px de altura, peso normal), no branco da barra.
const action =
  'flex h-[34px] cursor-pointer items-center gap-2 rounded-full px-2.5 text-[12px] font-normal text-zinc-50 outline-none select-none transition-[color,background-color,transform] duration-200 hover:bg-zinc-800 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-zinc-400 dark:text-zinc-950 dark:hover:bg-zinc-300 dark:focus-visible:ring-zinc-500';
const current = 'bg-zinc-800 dark:bg-zinc-300';

/**
 * As ações do notch da direita: a busca de comandos, o menu "Mais" (provisório, até a U19) e Ajustes, que
 * fica fora do conjunto diário mas sempre à vista (seção 3.1 do plano). No modo compacto, o componente
 * repete estas ações dentro da ilha.
 */
export function NotchActions({ active, onNavigate, onOpenCommands }: Props) {
  const t = useT();
  // Um lugar só aparece marcado na barra: o destino onde a rota mora, Ajustes (com Ajuda, Feedback e o resto
  // da manutenção) ou, para a sessão de foco, que não mora em nenhum, o "Mais".
  const place = destinationFor(active);
  const settingsActive = place === 'settings';
  const moreActive = place === null;

  // A margem negativa devolve aos ícones e ao texto o recuo de 20 px do notch do preview; o fundo de cada botão
  // ocupa parte desse recuo.
  return (
    <div className="-mx-2.5 flex items-center gap-1">
      <Tooltip delay={400}>
        <Focusable>
          <button type="button" className={action} aria-label={t('shell.commands')} aria-keyshortcuts="Meta+K" onClick={onOpenCommands}>
            <Search aria-hidden="true" className="size-4 shrink-0" />
            <kbd className="rounded-md bg-zinc-800 px-1.5 py-0.5 font-sans text-[11px] leading-none text-zinc-300 dark:bg-zinc-300 dark:text-zinc-700">{t('shell.commandsHint')}</kbd>
          </button>
        </Focusable>
        <Tooltip.Content>{t('shell.commands')}</Tooltip.Content>
      </Tooltip>

      <Dropdown>
        <Tooltip delay={400}>
          <Dropdown.Trigger aria-label={t('shell.more')} data-current={moreActive || undefined} className={`${action} w-[34px] justify-center px-0 ${moreActive ? current : ''}`}>
            <MoreHorizontal aria-hidden="true" className="size-4 shrink-0" />
          </Dropdown.Trigger>
          <Tooltip.Content>{t('shell.more')}</Tooltip.Content>
        </Tooltip>
        <Dropdown.Popover placement="bottom end" className="min-w-[200px] rounded-[20px] bg-zinc-950 text-zinc-50 dark:bg-zinc-200 dark:text-zinc-950">
          <Dropdown.Menu aria-label={t('shell.more')} className="gap-0.5 p-1.5" onAction={(key) => onNavigate(key as NavKey)}>
            {MORE_ITEMS.map((item) => {
              const isCurrent = item.key === active || (item.key === 'focus' && active === 'break');
              return (
                <Dropdown.Item
                  key={item.key}
                  id={item.key}
                  textValue={t(item.label)}
                  // O nome fica só o da seção; "atual" é a descrição, lida depois dele.
                  aria-label={t(item.label)}
                  data-current={isCurrent || undefined}
                  // Como os itens do menu compacto do preview: no branco da barra, e o atual com o fundo da pílula.
                  className={`min-h-0 justify-between rounded-xl px-3 py-2 text-[14px] font-normal text-zinc-50 dark:text-zinc-950 ${isCurrent ? 'bg-zinc-800 dark:bg-zinc-300' : 'hover:bg-zinc-900 data-[focused=true]:bg-zinc-900 dark:hover:bg-zinc-300/60 dark:data-[focused=true]:bg-zinc-300/60'}`}
                >
                  <span>{t(item.label)}</span>
                  {isCurrent && (
                    <>
                      <Check aria-hidden="true" className="size-3.5" />
                      <Description className="sr-only">{t('redesign.nav.current')}</Description>
                    </>
                  )}
                </Dropdown.Item>
              );
            })}
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>

      <button type="button" className={`${action} ${settingsActive ? current : ''}`} aria-current={settingsActive ? ariaCurrentFor(active) : undefined} onClick={() => onNavigate('settings')}>
        <Settings2 aria-hidden="true" className="size-4 shrink-0" />
        {t('nav.settings')}
      </button>
    </div>
  );
}

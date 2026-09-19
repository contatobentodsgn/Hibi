import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ComponentType, KeyboardEvent, ReactNode } from 'react';
import { LayoutGroup, motion } from 'motion/react';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { HibiUiRoot } from '../redesign/components/HibiUiRoot';
import { nextFocusIndex } from './routes';

/*
 * A Adaptive Notch Navigation Bar do preview aprovado (`Hibi-preview-adaptive-notch-validado-2026-09-18.zip`,
 * `src/components/ui/adaptive-notch-navigation-bar.tsx`, SHA-256 no `docs/redesign/reference-manifest.md`),
 * desenvolvida pelo usuário no Codex. As asas SVG, as classes e as medidas são as do arquivo original.
 *
 * O que mudou, e por quê:
 * - Semântica de navegação: `nav` com `aria-current="page"` no lugar de `tablist`/`tab`, porque cada destino
 *   troca a tela inteira (seção 4.2 do plano). O menu compacto é uma lista que abre e fecha; fechada, sai da
 *   ordem do Tab (`inert`).
 * - Setas, Home e End movem o foco entre os botões da barra, como no dock antigo; Escape fecha o menu
 *   compacto e devolve o foco ao botão que o abriu.
 * - Camadas: a moldura e a superfície ficam fora de `.hibi-ui`, porque o conteúdo das telas atuais mora
 *   dentro delas e perderia o próprio CSS lá dentro. Só a barra fica em `HibiUiRoot`, numa camada com
 *   `z-index: 4` (o dock antigo usava 4 e os modais das telas atuais usam 5): um modal continua cobrindo a
 *   navegação.
 * - A barra vem antes do conteúdo na árvore, como no preview: o Tab e o leitor de tela chegam aos destinos
 *   antes da tela. A faixa do topo (e a borda de cima da moldura) é a região de arrastar a janela no macOS; os
 *   botões da barra não arrastam, e o conteúdo, que vem depois, não declara região (ver notch.css).
 * - O que rola por baixo da faixa de arrastar some sob uma borda da cor da superfície: ali o clique é da
 *   janela, então o conteúdo não pode parecer clicável (seção 4.5 do plano). A borda só aparece com a área de
 *   trabalho rolada; parada, a janela é pixel a pixel a do preview.
 * - A área de rolagem herda o raio da superfície, porque o conteúdo das telas atuais tem fundo próprio e,
 *   sem isso, cobriria as quinas arredondadas de baixo.
 * - As ações da direita existem uma vez só: o preview as repete na barra larga e na ilha e esconde uma delas
 *   com CSS, mas uma cópia escondida de menus e dicas ficaria montada à toa (o React Aria reclama dela). A troca
 *   de layout continua no CSS, no mesmo ponto do preview (1280 px).
 * - Texto dos botões: no preview, o CSS global dele (`button { font: inherit; color: inherit }`, sem camada)
 *   vence os utilitários do componente. As capturas aprovadas mostram esse resultado, e é ele que vale: todos
 *   os itens no branco da barra, 14 px e peso normal; o destino atual se distingue pela pílula e pelo ícone.
 *   As classes aqui descrevem esse resultado direto, em vez de `text-zinc-400` e `font-semibold`, que o
 *   preview declarava mas nunca mostrou.
 */

const cn = (...values: (string | false | null | undefined)[]) => values.filter(Boolean).join(' ');

export type NotchPosition = 'top' | 'bottom';

export interface NotchItemData {
  id: string;
  label: string;
  icon?: LucideIcon | ComponentType<{ className?: string }>;
  badge?: string;
  disabled?: boolean;
}

export interface NotchWingProps {
  position?: NotchPosition;
  className?: string;
}

export function NotchLeftWing({ position = 'top', className }: NotchWingProps) {
  const isBottom = position === 'bottom';

  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      shapeRendering="geometricPrecision"
      className={cn(
        'pointer-events-none absolute right-full size-2.5 md:size-4 overflow-visible select-none text-zinc-950 transition-colors duration-200 dark:text-zinc-200',
        isBottom ? 'bottom-0' : 'top-0',
        className
      )}
    >
      <path
        d={isBottom ? 'M 0 20 C 11.046 20 20 11.046 20 0 H 21 V 21 H 0 Z' : 'M 0 0 C 11.046 0 20 8.954 20 20 H 21 V -1 H 0 Z'}
        fill="currentColor"
      />
    </svg>
  );
}

export function NotchRightWing({ position = 'top', className }: NotchWingProps) {
  const isBottom = position === 'bottom';

  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      shapeRendering="geometricPrecision"
      className={cn(
        'pointer-events-none absolute left-full size-2.5 md:size-4 overflow-visible select-none text-zinc-950 transition-colors duration-200 dark:text-zinc-200',
        isBottom ? 'bottom-0' : 'top-0',
        className
      )}
    >
      <path
        d={isBottom ? 'M 20 20 C 8.954 20 0 11.046 0 0 H -1 V 21 H 20 Z' : 'M 20 0 C 8.954 0 0 8.954 0 20 H -1 V -1 H 20 Z'}
        fill="currentColor"
      />
    </svg>
  );
}

export function NotchCornerLeftWing({ position = 'top', className }: NotchWingProps) {
  const isBottom = position === 'bottom';

  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      shapeRendering="geometricPrecision"
      className={cn(
        'pointer-events-none absolute left-0 size-2.5 md:size-4 overflow-visible select-none text-zinc-950 transition-colors duration-200 dark:text-zinc-200',
        isBottom ? 'bottom-full' : 'top-full',
        className
      )}
    >
      <path
        d={isBottom ? 'M 0 20 H 20 C 8.954 20 0 11.046 0 0 V 20 Z' : 'M 0 0 H 20 C 8.954 0 0 8.954 0 20 V 0 Z'}
        fill="currentColor"
      />
    </svg>
  );
}

export function NotchCornerRightWing({ position = 'top', className }: NotchWingProps) {
  const isBottom = position === 'bottom';

  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      shapeRendering="geometricPrecision"
      className={cn(
        'pointer-events-none absolute right-0 size-2.5 md:size-4 overflow-visible select-none text-zinc-950 transition-colors duration-200 dark:text-zinc-200',
        isBottom ? 'bottom-full' : 'top-full',
        className
      )}
    >
      <path
        d={isBottom ? 'M 20 20 H 0 C 11.046 20 20 11.046 20 0 V 20 Z' : 'M 20 0 H 0 C 11.046 0 20 8.954 20 20 V 0 Z'}
        fill="currentColor"
      />
    </svg>
  );
}

interface NotchItemProps {
  item: NotchItemData;
  isActive: boolean;
  onSelect: (id: string) => void;
}

function NotchItem({ item, isActive, onSelect }: NotchItemProps) {
  const { id, label, icon: Icon, badge, disabled } = item;

  return (
    <button
      type="button"
      aria-current={isActive ? 'page' : undefined}
      disabled={disabled}
      onClick={() => onSelect(id)}
      className={cn(
        'relative flex h-9 cursor-pointer items-center gap-2 rounded-full px-3.5 text-[14px] font-normal transition-colors outline-none select-none',
        'focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-1 dark:focus-visible:ring-zinc-500',
        disabled && 'cursor-not-allowed pointer-events-none opacity-40'
      )}
    >
      {isActive && (
        <motion.span
          layoutId="notch-active-pill"
          className="absolute inset-0 rounded-full bg-zinc-800 dark:bg-zinc-300"
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
      )}

      <span className="relative z-10 flex items-center gap-2">
        {Icon && (
          <Icon
            className={cn(
              'size-4 shrink-0 transition-colors',
              isActive ? 'text-zinc-50 dark:text-zinc-950' : 'text-zinc-400 dark:text-zinc-600'
            )}
          />
        )}

        <span className="leading-none">{label}</span>

        {badge && (
          <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] font-bold tracking-tight uppercase text-zinc-300 dark:bg-zinc-300 dark:text-zinc-800">
            {badge}
          </span>
        )}
      </span>
    </button>
  );
}

interface NotchDropdownItemProps {
  item: NotchItemData;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

function NotchDropdownItem({ item, isSelected, onSelect }: NotchDropdownItemProps) {
  const Icon = item.icon;

  return (
    <button
      type="button"
      aria-current={isSelected ? 'page' : undefined}
      disabled={item.disabled}
      onClick={() => onSelect(item.id)}
      className={cn(
        'flex w-full cursor-pointer items-center justify-between gap-2.5 rounded-xl px-3 py-2 text-left text-[14px] font-normal outline-none transition-colors select-none',
        'focus-visible:ring-2 focus-visible:ring-zinc-400 dark:focus-visible:ring-zinc-500',
        isSelected
          ? 'bg-zinc-800 dark:bg-zinc-300'
          : 'hover:bg-zinc-900 active:bg-zinc-800 dark:hover:bg-zinc-300/60 dark:active:bg-zinc-300',
        item.disabled && 'cursor-not-allowed pointer-events-none opacity-40'
      )}
    >
      <span className="flex items-center gap-2.5">
        {Icon && <Icon className={cn('size-4 shrink-0', isSelected ? 'text-zinc-50 dark:text-zinc-950' : 'text-zinc-400 dark:text-zinc-600')} />}
        <span>{item.label}</span>
      </span>

      {isSelected && <Check aria-hidden="true" className="size-3.5 text-zinc-50 dark:text-zinc-950" />}
    </button>
  );
}

export interface AdaptiveNotchNavigationProps {
  items: readonly NotchItemData[];
  /** O destino atual, ou `null` quando a rota não pertence a nenhum (a sessão de foco, por exemplo). */
  activeId: string | null;
  position?: NotchPosition;
  /** Nome da região de navegação para leitores de tela. */
  label: string;
  /** O que o botão do modo compacto mostra quando nenhum destino está ativo. */
  currentLabel?: string;
  /** Dica lida depois do nome do botão do modo compacto ("mudar de seção"). */
  switchLabel: string;
  logo?: ReactNode;
  rightContent?: ReactNode;
  showLogo?: boolean;
  showRightContent?: boolean;
  children?: ReactNode;
  onActiveChange: (id: string) => void;
  className?: string;
}

// O `xl` do Tailwind: a partir dele, a barra larga; abaixo, a ilha compacta.
const WIDE_QUERY = '(min-width: 80rem)';

// Qual dos dois layouts está em uso, para montar as ações só nele. Sem `matchMedia` (renderização no servidor
// e nos testes) a resposta é `undefined` e os dois recebem as ações, como no preview.
function useWideLayout(): boolean | undefined {
  const [wide, setWide] = useState(() => (typeof window === 'undefined' || !window.matchMedia ? undefined : window.matchMedia(WIDE_QUERY).matches));
  useEffect(() => {
    if (!window.matchMedia) return;
    const media = window.matchMedia(WIDE_QUERY);
    const update = () => setWide(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return wide;
}

// Os botões da barra que as setas percorrem: os visíveis (o modo que não está em uso tem `display: none`)
// e fora do menu compacto, que tem as próprias setas.
const barButtons = (nav: HTMLElement) =>
  Array.from(nav.querySelectorAll<HTMLElement>('button')).filter(
    (button) => !button.closest('[data-notch-drawer]') && button.getClientRects().length > 0 && !(button as HTMLButtonElement).disabled
  );

export function AdaptiveNotchNavigation({
  items,
  activeId,
  position = 'top',
  label,
  currentLabel,
  switchLabel,
  logo,
  rightContent,
  showLogo = true,
  showRightContent = true,
  children,
  onActiveChange,
  className,
}: AdaptiveNotchNavigationProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const islandRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLUListElement>(null);
  const layoutGroupId = useId();
  const drawerId = useId();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const wide = useWideLayout();
  const isBottom = position === 'bottom';
  const activeItem = items.find((item) => item.id === activeId);
  const ActiveIcon = activeItem?.icon;

  // A largura da barra de rolagem da área de trabalho (0 com as barras que só aparecem ao rolar): a borda sob a
  // faixa de arrastar para antes dela, sem cobrir o polegar.
  const [gutter, setGutter] = useState(0);
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === 'undefined') return;
    const measure = () => setGutter(viewport.offsetWidth - viewport.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  // A borda só aparece com a área de trabalho rolada (`data-scrolled` na moldura, lido por notch.css). O atributo
  // muda direto no elemento, sem render, e só quando a rolagem sai do topo ou volta a ele.
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const frame = frameRef.current;
    if (!viewport || !frame) return;
    const update = () => {
      const scrolled = String(viewport.scrollTop > 0);
      if (frame.dataset.scrolled !== scrolled) frame.dataset.scrolled = scrolled;
    };
    update();
    viewport.addEventListener('scroll', update, { passive: true });
    return () => viewport.removeEventListener('scroll', update);
  }, []);

  // Fechar sem escolher devolve o foco ao botão, se ele estava no menu. Clicar fora não rouba o foco de
  // onde a pessoa clicou.
  const closeDropdown = useCallback((returnFocus: boolean) => {
    const focusWasInDrawer = !!drawerRef.current?.contains(document.activeElement);
    setIsDropdownOpen(false);
    if (returnFocus || focusWasInDrawer) triggerRef.current?.focus();
  }, []);

  const handleSelect = useCallback(
    (id: string) => {
      const fromDrawer = !!drawerRef.current?.contains(document.activeElement);
      setIsDropdownOpen(false);
      if (fromDrawer) triggerRef.current?.focus();
      onActiveChange(id);
    },
    [onActiveChange]
  );

  // Aberto, o menu recebe o foco no destino atual (ou no primeiro): com as ações ao lado do botão, o Tab
  // passaria por elas antes de chegar aos destinos. Espera o `inert` sair, no efeito.
  useEffect(() => {
    if (!isDropdownOpen) return;
    const options = drawerRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
    (drawerRef.current?.querySelector<HTMLButtonElement>('button[aria-current="page"]') ?? options?.[0])?.focus();
  }, [isDropdownOpen]);

  useEffect(() => {
    if (!isDropdownOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (islandRef.current && !islandRef.current.contains(event.target as Node)) closeDropdown(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isDropdownOpen, closeDropdown]);

  const handleNavKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && isDropdownOpen) {
      event.preventDefault();
      closeDropdown(true);
      return;
    }
    const inDrawer = !!(event.target as HTMLElement).closest('[data-notch-drawer]');
    const keys = inDrawer ? ['ArrowUp', 'ArrowDown', 'Home', 'End'] : ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(event.key) || !navRef.current) return;
    const buttons = inDrawer
      ? Array.from(drawerRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
      : barButtons(navRef.current);
    const index = buttons.indexOf(event.target as HTMLElement);
    if (index < 0) return;
    event.preventDefault();
    buttons[nextFocusIndex(index, buttons.length, event.key as 'ArrowLeft')]?.focus();
  };

  return (
    <div
      ref={frameRef}
      data-position={position}
      className={cn(
        'notch-frame fixed inset-0 h-screen w-screen overflow-hidden bg-zinc-950 p-0 md:p-2 transition-colors duration-200 dark:bg-zinc-200',
        className
      )}
    >
      <div className="notch-surface relative flex h-full w-full flex-col rounded-none md:rounded-2xl bg-(--hibi-canvas) text-(--hibi-ink) antialiased transition-colors duration-200">
        {/* A barra vem antes da área de rolagem na árvore, como no preview (ver o comentário em notch.css); o
            `z-index` da camada a põe por cima dela. */}
        <HibiUiRoot className="notch-layer pointer-events-none absolute inset-0 z-[4] rounded-[inherit]">
          {/* O que rola por baixo da faixa de arrastar some sob a cor da superfície (ver o comentário do topo). */}
          <div aria-hidden="true" className="notch-scroll-edge absolute inset-0 overflow-hidden rounded-[inherit]">
            <div className="absolute top-0 left-0 h-11 bg-linear-to-b from-(--hibi-canvas) from-70% to-transparent" style={{ right: gutter }} />
          </div>

          <div aria-hidden="true" className="notch-drag-region absolute inset-x-0 top-0 h-11 md:-inset-x-2 md:-top-2 md:h-13" />

          <div
            aria-hidden="true"
            data-open={isDropdownOpen}
            onClick={() => closeDropdown(false)}
            className={cn(
              'notch-backdrop absolute inset-0 z-40 rounded-none md:rounded-2xl transition-opacity duration-200 ease-out xl:hidden',
              isDropdownOpen
                ? 'pointer-events-auto bg-black/20 backdrop-blur-[2px] opacity-100 dark:bg-black/40'
                : 'pointer-events-none opacity-0'
            )}
          />

          <nav ref={navRef} aria-label={label} onKeyDown={handleNavKeyDown} className="notch-nav absolute inset-0 z-50">
            {/* Notch do logo, à esquerda (opcional). */}
            {showLogo && logo && (
              <div
                className={cn(
                  'notch-part hidden xl:flex absolute left-0 z-50 h-10 px-5 select-none transition-colors duration-200 bg-zinc-950 dark:bg-zinc-200 dark:text-zinc-950',
                  isBottom ? 'bottom-0 rounded-tr-[24px] md:items-end' : 'top-0 rounded-br-[24px] md:items-baseline'
                )}
              >
                <div className="flex items-center text-zinc-50 dark:text-zinc-950">{logo}</div>
                <NotchRightWing position={position} />
                <NotchCornerLeftWing position={position} />
              </div>
            )}

            {/* Notch central, com os destinos (janela a partir de 1280 px). */}
            <div
              className={cn(
                'notch-part notch-center hidden xl:flex absolute left-1/2 -translate-x-1/2 z-50 h-11 px-4 bg-zinc-950 text-zinc-50 select-none transition-colors duration-200 dark:bg-zinc-200 dark:text-zinc-950',
                isBottom ? 'bottom-0 rounded-t-[24px] md:items-end' : 'top-0 rounded-b-[24px] md:items-start'
              )}
            >
              <NotchLeftWing position={position} />
              <NotchRightWing position={position} />

              <LayoutGroup id={layoutGroupId}>
                <ul className="flex items-center gap-1">
                  {items.map((item) => (
                    <li key={item.id}>
                      <NotchItem item={item} isActive={item.id === activeId} onSelect={handleSelect} />
                    </li>
                  ))}
                </ul>
              </LayoutGroup>
            </div>

            {/* Notch das ações, à direita (opcional). */}
            {showRightContent && rightContent && wide !== false && (
              <div
                className={cn(
                  'notch-part notch-actions hidden xl:flex absolute right-0 z-50 h-10 px-5 select-none transition-colors duration-200 bg-zinc-950 dark:bg-zinc-200 dark:text-zinc-950',
                  isBottom ? 'bottom-0 rounded-tl-[24px] md:items-end' : 'top-0 rounded-bl-[24px] md:items-start'
                )}
              >
                <NotchLeftWing position={position} />
                <NotchCornerRightWing position={position} />
                <div className="flex items-center text-zinc-50 dark:text-zinc-950">{rightContent}</div>
              </div>
            )}

            {/* Janela estreita (abaixo de 1280 px): uma ilha só, com o destino atual e o menu. */}
            <div
              ref={islandRef}
              className={cn(
                'notch-part notch-island xl:hidden absolute z-50 flex flex-col bg-zinc-950 text-zinc-50 select-none transition-colors duration-200 dark:bg-zinc-200 dark:text-zinc-950',
                'w-auto left-1/2 -translate-x-1/2 px-4',
                isBottom ? 'bottom-0 rounded-t-[24px]' : 'top-0 rounded-b-[24px]'
              )}
            >
              <NotchLeftWing position={position} />
              <NotchRightWing position={position} />

              <div
                className={cn(
                  'w-auto xl:w-max lg:w-full flex h-10 sm:h-10 items-center justify-between gap-3 sm:gap-5',
                  isBottom ? 'sm:items-baseline md:items-end' : 'sm:items-baseline md:items-start'
                )}
              >
                {showLogo && logo && <div className="flex shrink-0 items-center text-zinc-50 dark:text-zinc-950">{logo}</div>}

                <button
                  ref={triggerRef}
                  type="button"
                  aria-label={`${activeItem?.label ?? currentLabel ?? ''}, ${switchLabel}`}
                  aria-expanded={isDropdownOpen}
                  aria-controls={drawerId}
                  onClick={() => (isDropdownOpen ? closeDropdown(false) : setIsDropdownOpen(true))}
                  className="group flex h-8 sm:h-8.5 w-full cursor-pointer items-center justify-center gap-1.5 rounded-full px-2.5 py-2.5 sm:p-2.5 text-[14px] font-normal outline-none transition-colors sm:hover:bg-zinc-850/60 focus-visible:ring-2 focus-visible:ring-zinc-400 dark:text-zinc-950 dark:sm:hover:bg-zinc-300/60 dark:focus-visible:ring-zinc-500"
                >
                  {ActiveIcon && <ActiveIcon className="size-3.5 sm:size-4 shrink-0 text-zinc-400 dark:text-zinc-600" />}
                  <span className="leading-none whitespace-nowrap">{activeItem?.label ?? currentLabel}</span>
                  {isBottom ? (
                    <ChevronUp aria-hidden="true" className={cn('size-3.5 text-zinc-400 transition-transform duration-200 dark:text-zinc-600', isDropdownOpen && 'rotate-180')} />
                  ) : (
                    <ChevronDown aria-hidden="true" className={cn('size-3.5 text-zinc-400 transition-transform duration-200 dark:text-zinc-600', isDropdownOpen && 'rotate-180')} />
                  )}
                </button>

                {showRightContent && rightContent && wide !== true && (
                  <div className="flex shrink-0 items-center justify-end text-zinc-50 dark:text-zinc-950 w-max">{rightContent}</div>
                )}
              </div>

              <div
                data-notch-drawer=""
                inert={!isDropdownOpen}
                className={cn(
                  'grid transition-[grid-template-rows,opacity] duration-200 ease-out w-full',
                  isDropdownOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'
                )}
              >
                <div className="overflow-hidden">
                  <ul
                    ref={drawerRef}
                    id={drawerId}
                    className={cn('flex w-full flex-col gap-0.5 px-0.5', isBottom ? 'pb-2 pt-1.5' : 'pt-1.5 pb-2.5')}
                  >
                    {items.map((item) => (
                      <li key={item.id}>
                        <NotchDropdownItem item={item} isSelected={item.id === activeId} onSelect={handleSelect} />
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </nav>
        </HibiUiRoot>

        <div ref={viewportRef} className={cn('notch-viewport relative w-full h-full overflow-y-auto overflow-x-hidden rounded-[inherit]', isBottom ? 'pt-3 pb-17.5' : 'pt-17.5 pb-3')}>
          {children}
        </div>
      </div>
    </div>
  );
}

import type { ReactElement, ReactNode } from 'react';
import { Button, Drawer } from '@heroui/react';
import { X } from 'lucide-react';
import { useT } from '../../../i18n/LocaleProvider';
import { useNarrowWindow } from './useNarrowWindow';
import './components.css';

export type EntityFact = Readonly<{ label: string; value: ReactNode }>;

type EntityDetailsPanelProps = Readonly<{
  /** O botão que abre o painel (um `Button` do HeroUI): o React Aria o liga ao painel e devolve o foco a ele. */
  trigger: ReactElement;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: ReactNode;
  /** A etiqueta do alto (estado, prazo), à esquerda do botão de fechar. */
  tag?: ReactNode;
  /** Os dados do item, em pares de rótulo e valor (`dl`). */
  facts?: readonly EntityFact[];
  children?: ReactNode;
  /** Os botões do pé: a ação principal primeiro. */
  actions?: ReactNode;
}>;

/**
 * O detalhe de um item (tarefa, bloco, lembrete) numa folha presa à direita, dentro da moldura da janela (U05).
 * É o `Drawer` do HeroUI: prende o foco, fecha com Escape, com um clique fora ou arrastando a folha, e devolve o
 * foco a quem a abriu. Em janela estreita, sobe de baixo.
 */
export function EntityDetailsPanel({ trigger, isOpen, onOpenChange, title, tag, facts = [], children, actions }: EntityDetailsPanelProps) {
  const t = useT();
  const narrow = useNarrowWindow();
  return (
    <Drawer isOpen={isOpen} onOpenChange={onOpenChange}>
      {trigger}
      <Drawer.Backdrop isDismissable className="hibi-overlay-backdrop">
        <Drawer.Content placement={narrow ? 'bottom' : 'right'}>
          <Drawer.Dialog className="hibi-details-panel">
            <div className="hibi-details-panel__top">
              {tag ?? <span />}
              <Button slot="close" variant="ghost" isIconOnly aria-label={t('redesign.common.close')}>
                <X aria-hidden="true" size={20} />
              </Button>
            </div>
            <Drawer.Heading className="hibi-details-panel__title">{title}</Drawer.Heading>
            {facts.length > 0 && (
              <dl className="hibi-details-panel__facts">
                {facts.map((fact) => (
                  <div key={fact.label} className="hibi-details-panel__fact">
                    <dt>{fact.label}</dt>
                    <dd>{fact.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {children && <div className="hibi-details-panel__body">{children}</div>}
            {actions && <div className="hibi-details-panel__actions">{actions}</div>}
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  );
}

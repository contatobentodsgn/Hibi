import type { ReactElement, ReactNode } from 'react';
import { Button, Modal } from '@heroui/react';
import { ArrowRight, X, type LucideIcon } from 'lucide-react';
import { useT } from '../../../i18n/LocaleProvider';
import './components.css';

type ActionDialogProps = Readonly<{
  /** O botão que abre o diálogo (um `Button` do HeroUI): o React Aria o liga ao diálogo e devolve o foco a ele. */
  trigger: ReactElement;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: ReactNode;
  /** A etiqueta do alto, à esquerda do botão de fechar. */
  tag?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}>;

/**
 * Diálogo de ação curta ou de confirmação (U05): o `.preview-dialog` do preview sobre o `Modal` do HeroUI. O
 * `Modal` prende o foco lá dentro, fecha com Escape e com um clique fora e devolve o foco a quem o abriu. Um
 * detalhe que a pessoa lê e edita vai no `EntityDetailsPanel`, não aqui.
 */
export function ActionDialog({ trigger, isOpen, onOpenChange, title, tag, description, children }: ActionDialogProps) {
  const t = useT();
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      {trigger}
      <Modal.Backdrop isDismissable className="hibi-overlay-backdrop">
        <Modal.Container>
          <Modal.Dialog className="hibi-action-dialog">
            <div className="hibi-action-dialog__top">
              {tag ?? <span />}
              <Button slot="close" variant="ghost" isIconOnly aria-label={t('redesign.common.close')}>
                <X aria-hidden="true" size={20} />
              </Button>
            </div>
            <Modal.Heading className="hibi-action-dialog__title">{title}</Modal.Heading>
            {description && <p className="hibi-action-dialog__body">{description}</p>}
            {children}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

/** As escolhas de um diálogo (`.create-options` do preview): cada uma leva a um lugar ou abre um formulário. */
export function ActionDialogOptions({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div role="group" aria-label={label} className="hibi-action-dialog__options">
      {children}
    </div>
  );
}

export function ActionDialogOption({ icon: Icon, onPress, children }: Readonly<{ icon?: LucideIcon; onPress: () => void; children: ReactNode }>) {
  return (
    <button type="button" className="hibi-action-dialog__option" onClick={onPress}>
      {Icon && <Icon aria-hidden="true" size={17} />}
      <span>{children}</span>
      <ArrowRight aria-hidden="true" size={17} />
    </button>
  );
}

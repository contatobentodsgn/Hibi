import { useState } from 'react';
import { Button } from '@heroui/react';
import { X } from 'lucide-react';
import { useT } from '../../../i18n/LocaleProvider';
import { dismissContextualGuidance, isContextualGuidanceDismissed } from './contextual-guidance-state';
import './contextual-guidance.css';

type Props = Readonly<{
  id: string;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}>;

/** Uma única sugestão ligada a um estado observado; a dispensa fica apenas no armazenamento local do renderer. */
export function ContextualGuidance({ id, title, description, actionLabel, onAction }: Props) {
  const t = useT();
  const [dismissed, setDismissed] = useState(() => isContextualGuidanceDismissed(id));
  if (dismissed) return null;

  const dismiss = () => {
    dismissContextualGuidance(id);
    setDismissed(true);
  };

  return <aside className="contextual-guidance" data-contextual-guidance={id} aria-label={t('contextual.region')}>
    <div className="contextual-guidance__copy"><strong>{title}</strong><p>{description}</p></div>
    <Button size="sm" variant="secondary" onPress={() => { onAction(); dismiss(); }}>{actionLabel}</Button>
    <Button isIconOnly size="sm" variant="ghost" aria-label={t('contextual.dismiss')} onPress={dismiss}><X size={16} aria-hidden="true" /></Button>
  </aside>;
}

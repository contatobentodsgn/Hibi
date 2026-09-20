import React from 'react';
import { ArrowUpRight, Timer } from 'lucide-react';
import { Button } from '@heroui/react';
import { useT } from '../i18n/LocaleProvider';

/** Aviso nas outras telas de que a sessão de foco continua, com o caminho de volta a ela. */
export function FocusBackgroundNotice({ onReturn }: Readonly<{ onReturn: () => void }>) {
  const t = useT();
  return <div role="status" className="focus-background focus-background--redesign"><Timer size={17} aria-hidden="true" /><div><strong>{t('background.focus.running')}</strong><span>A sessão continua mesmo enquanto você usa outras áreas.</span></div><Button variant="secondary" onPress={onReturn}>{t('background.focus.return')}<ArrowUpRight size={15} /></Button></div>;
}

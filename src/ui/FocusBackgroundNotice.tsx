import React from 'react';
import { useT } from '../i18n/LocaleProvider';

/** Aviso nas outras telas de que a sessão de foco continua, com o caminho de volta a ela. */
export function FocusBackgroundNotice({ onReturn }: Readonly<{ onReturn: () => void }>) {
  const t = useT();
  return <div role="status" className="notice focus-background" style={{ marginBottom: 16 }}><div><strong>{t('background.focus.running')}</strong></div><button className="outline" onClick={onReturn}>{t('background.focus.return')}</button></div>;
}

import type { ReactNode } from 'react';
import './components.css';

/**
 * O cabeçalho de página do preview (`.page-heading`): o título grande da tela, uma linha de apoio e as ações
 * dela à direita. Em janela estreita, as ações descem e o título encolhe, como no preview.
 */
export function SectionHeader({ title, subtitle, actions }: Readonly<{ title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }>) {
  return (
    <header className="hibi-section-header">
      <div className="min-w-0">
        <h1 className="hibi-section-header__title">{title}</h1>
        {subtitle && <p className="hibi-section-header__subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="hibi-section-header__actions">{actions}</div>}
    </header>
  );
}

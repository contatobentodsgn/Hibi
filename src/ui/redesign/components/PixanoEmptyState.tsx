import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import './components.css';

export type EmptyStateTone = 'lavender' | 'mint' | 'peach' | 'blue';

/**
 * Um lugar vazio, com o que dá para fazer ali (U05): nada criado ainda, busca sem resultado, recurso só do app de
 * desktop ou permissão negada. O círculo de ícone é o dos cartões do preview (`.icon-circle`). O nome evita o
 * `EmptyState` do HeroUI, que é só um parágrafo com recuo.
 */
export function PixanoEmptyState({ icon: Icon, tone, title, description, action, headingLevel = 3 }: Readonly<{
  icon?: LucideIcon;
  tone?: EmptyStateTone;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** O nível do título na página: 3 dentro de um cartão com título próprio, 2 quando o vazio é a seção inteira. */
  headingLevel?: 2 | 3;
}>) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <div className="hibi-empty-state">
      {Icon && (
        <span aria-hidden="true" className="hibi-empty-state__icon" data-tone={tone}>
          <Icon size={20} />
        </span>
      )}
      <div className="hibi-empty-state__content">
        <Heading className="hibi-empty-state__title">{title}</Heading>
        {description && <p className="hibi-empty-state__description">{description}</p>}
        {action}
      </div>
    </div>
  );
}

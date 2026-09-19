import { ArrowUpRight, type LucideIcon } from 'lucide-react';
import './components.css';

/**
 * O atalho redondo dos cartões do preview (`.round-link`): leva a outra tela. No app não há endereços, então é
 * um botão, e o nome dele diz para onde vai ("Ver tarefas da semana").
 */
export function RoundLink({ label, onPress, icon: Icon = ArrowUpRight }: Readonly<{ label: string; onPress: () => void; icon?: LucideIcon }>) {
  return (
    <button type="button" className="hibi-round-link" aria-label={label} onClick={onPress}>
      <Icon aria-hidden="true" size={17} />
    </button>
  );
}

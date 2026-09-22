import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createSeedData } from '../../data/seed-data';
import { HabitsScreen } from '../redesign/screens/HabitsScreen';
import { GoalsScreen } from '../redesign/screens/GoalsScreen';

const noop = () => undefined;

describe('redesigned rhythm screens', () => {
  it('renders the habit rhythm, weekly progress and create surface', () => {
    const markup = renderToStaticMarkup(<HabitsScreen data={createSeedData()} onCreate={noop} onToggleCompletion={noop} onUpdate={noop} onDelete={noop} />);
    expect(markup).toContain('Rotina');
    expect(markup).toContain('Novo hábito');
    expect(markup).toContain('Seu ritmo');
  });

  it('renders goals with a visible next milestone and progress controls', () => {
    const markup = renderToStaticMarkup(<GoalsScreen data={createSeedData()} onCreate={noop} onProgress={noop} onUpdate={noop} onDelete={noop} />);
    expect(markup).toContain('Progresso');
    expect(markup).toContain('Nova meta');
    expect(markup).toContain('O que você quer mover');
  });
});

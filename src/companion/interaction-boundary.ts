import type { CompanionInteraction } from './contracts';

export type CompanionSurface = 'visual' | 'action';

type BoundaryInput = Readonly<{
  actions: readonly unknown[];
  interaction: CompanionInteraction;
}>;

/** Keeps every action-bearing presentation out of the passive mascot host. */
export const classifyCompanionPresentation = ({ actions, interaction }: BoundaryInput): CompanionSurface =>
  actions.length > 0 || interaction === 'capture' ? 'action' : 'visual';

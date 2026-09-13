import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WorkspaceState } from '../WorkspaceState';

describe('WorkspaceState', () => {
  it('gives an empty workspace a named status and actionable next step', () => {
    const markup = renderToStaticMarkup(<WorkspaceState title="No tasks match" detail="Try another filter or add a task." action="Clear filters" onAction={() => undefined} />);

    expect(markup).toContain('role="status"');
    expect(markup).toContain('No tasks match');
    expect(markup).toContain('Clear filters');
  });
});

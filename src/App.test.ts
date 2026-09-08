import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');

describe('schedule validation feedback', () => {
  it('uses an accessible inline error surface instead of a browser alert', () => {
    expect(appSource).not.toContain('window.alert(validation.errors.join');
    expect(appSource).toContain('role="alert"');
    expect(appSource).toContain('aria-live="assertive"');
  });
});

describe('study data reset instrumentation', () => {
  it('logs a successful reset after resetting and refreshing the repository data', () => {
    const resetBody = appSource.match(/const resetStudyData = \(\) => \{([\s\S]*?)\n  \};/)?.[1] ?? '';

    expect(resetBody).toContain("if (!window.confirm('Reset all local study data?')) return;");
    expect(resetBody).toContain('repository.reset();');
    expect(resetBody).toContain('refreshData();');
    expect(resetBody).toContain("log('reset', 'Reset study data', 'pass');");
    expect(resetBody.indexOf('repository.reset();')).toBeLessThan(resetBody.indexOf('refreshData();'));
    expect(resetBody.indexOf('refreshData();')).toBeLessThan(resetBody.indexOf("log('reset', 'Reset study data', 'pass');"));
  });
});

describe('companion event wiring', () => {
  it('feeds the notch with real task, reminder, focus, and validation events', () => {
    expect(appSource).toContain("type: 'task.completed'");
    expect(appSource).toContain("type: 'reminder.triggered'");
    expect(appSource).toContain("type: 'focus.started'");
    expect(appSource).toContain("type: 'focus.completed'");
    expect(appSource).toContain("type: 'error.raised'");
    expect(appSource).toContain('onNotificationTriggered');
  });
});

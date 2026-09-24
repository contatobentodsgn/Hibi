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

describe('activity ledger wiring', () => {
  // Handlers de uma linha terminam na própria linha; os demais, no primeiro `};` com a indentação deles.
  const body = (name: string) => {
    const start = appSource.search(new RegExp(`\\n  const ${name} = (?:async )?\\(`));
    if (start < 0) return '';
    const firstLine = appSource.slice(start + 1, appSource.indexOf('\n', start + 1));
    return firstLine.trimEnd().endsWith('};') ? firstLine : appSource.slice(start, appSource.indexOf('\n  };', start));
  };
  const recordHelper = body('recordActivity');

  it('appends every input, refreshes once, and reports failures on the inline error surface', () => {
    expect(recordHelper).toContain('repository.appendActivity(input)');
    expect(recordHelper.match(/refreshData\(\);/g)).toHaveLength(1);
    expect(recordHelper).toContain("log('activity', type, 'fail');");
    expect(recordHelper).toContain("setValidationError('Não foi possível registrar a atividade.');");
    expect(recordHelper).toContain("let type = 'unknown';");
  });

  it.each([
    ['changeTaskStatus', 'repository.updateTask(id, { status });', 'recordActivity(taskStatusActivity(before, status, new Date().toISOString()));'],
    ['toggleHabitCompletion', 'repository.setHabitCompletion(id, date, completed);', 'recordActivity(habitCompletionActivity(before, date, completed, new Date().toISOString()));'],
    ['setGoalProgress', 'repository.setGoalProgress(id, current);', 'recordActivity(goalProgressActivities(before, after, new Date().toISOString()));'],
    ['createBlock', 'const block = repository.createBlock(input);', "recordActivity(blockActivity('created', block, new Date().toISOString()));"],
    ['deleteBlock', 'repository.deleteBlock(id);', "recordActivity(blockActivity('deleted', block, new Date().toISOString()));"],
  ])('%s records activity only after its mutation succeeded', (name, mutation, record) => {
    const handler = body(name);
    expect(handler).toContain(mutation);
    expect(handler).toContain(record);
    expect(handler.indexOf(mutation)).toBeLessThan(handler.indexOf(record));
  });

  // O repositório devolve objetos vivos: sem a cópia (e a cópia da lista de datas do hábito), o "antes" mudaria junto.
  it.each([
    ['changeTaskStatus', 'const before = { ...task };', 'repository.updateTask('],
    ['toggleHabitCompletion', 'const before = habit && { ...habit, completedDates: [...habit.completedDates] };', 'repository.setHabitCompletion('],
    ['setGoalProgress', 'const before = goal && { ...goal };', 'repository.setGoalProgress('],
  ])('%s copies its entity before mutating it', (name, copy, mutation) => {
    const handler = body(name);
    expect(handler).toContain(copy);
    expect(handler).toContain(mutation);
    expect(handler.indexOf(copy)).toBeLessThan(handler.indexOf(mutation));
  });

  it('records blocks only past validation and the delete confirmation', () => {
    const create = body('createBlock');
    expect(create.indexOf('if (!validation.valid)')).toBeLessThan(create.indexOf('recordActivity('));
    const remove = body('deleteBlock');
    expect(remove.indexOf('window.confirm(')).toBeLessThan(remove.indexOf('recordActivity('));
  });

  it('records Assistant task status changes and focus lifecycle events', () => {
    expect(appSource).not.toContain('onTaskCompleted');
    expect(appSource).toContain("onTaskStatusChanged: (before: Task, after: Task) => { recordActivity(taskStatusActivity(before, after.status ?? 'open', new Date().toISOString()));");
    expect(appSource).toContain('recordActivity(focusActivity(event.type, event.focusedMinutes, new Date().toISOString()));');
  });

  it('records blocks created and deleted through Assistant, but not block updates', () => {
    expect(appSource).toContain("onBlockCreated: (block: ScheduleBlock) => recordActivity(blockActivity('created', block, new Date().toISOString()))");
    expect(appSource).toContain("onBlockDeleted: (block: ScheduleBlock) => recordActivity(blockActivity('deleted', block, new Date().toISOString()))");
    expect(appSource).not.toContain('onBlockUpdated');
  });

  it('shows the task completion notch only on the transition to completed', () => {
    expect(appSource).toMatch(/onTaskStatusChanged: [^\n]*?if \(before\.status !== 'completed' && after\.status === 'completed'\) dispatchCompanion\(\{ type: 'task\.completed'/);
    const change = body('changeTaskStatus');
    expect(change).toContain("if (before.status !== 'completed' && status === 'completed') dispatchCompanion({ type: 'task.completed'");
    expect(change.match(/dispatchCompanion\(/g)).toHaveLength(1);
  });

  it('never records from reset, restore, imports, Notion sync, or local API writes', () => {
    for (const name of ['resetStudyData', 'restoreStudyData', 'applyImportedTask', 'applyNotionSync', 'resolveLocalApiIntent']) {
      const handler = body(name);
      expect(handler, name).not.toBe('');
      expect(handler, name).not.toContain('recordActivity');
    }
  });
});

describe('local calendar day', () => {
  // O dia do calendário vem sempre dos componentes locais da data. Derivá-lo do instante UTC faria
  // o app pular para amanhã depois das 21h em São Paulo.
  it('never derives the current day from the UTC instant', () => {
    expect(appSource).not.toContain('new Date().toISOString().slice(0, 10)');
    expect(appSource).toContain('const today = todayKey();');
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

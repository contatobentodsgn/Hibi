const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ANIMATIONS, createIdleEscalation, createMascot, mascotStateFor } = require('./mascot.cjs');

const root = path.join(__dirname, '..', 'public', 'mascot');

test('todo vídeo que o mascote pode pedir existe no pacote', () => {
  for (const names of Object.values(ANIMATIONS)) for (const name of names) assert.ok(fs.existsSync(path.join(root, `${name}.mp4`)), `${name}.mp4`);
});

test('cada tipo de apresentação vira um estado do mascote, e o desconhecido é repouso', () => {
  assert.equal(mascotStateFor('listening'), 'listening');
  assert.equal(mascotStateFor('thinking'), 'thinking');
  assert.equal(mascotStateFor('result'), 'happy');
  assert.equal(mascotStateFor('error'), 'sad');
  assert.equal(mascotStateFor('confirmation'), 'attention');
  assert.equal(mascotStateFor('focus'), 'focus');
  assert.equal(mascotStateFor('qualquer'), 'idle');
});

test('estados com variações sorteiam uma delas', () => {
  const mascot = createMascot({ root, pick: () => 0.99 });
  assert.equal(path.basename(mascot.animationPath('happy')), 'happy_4.mp4');
  assert.equal(path.basename(createMascot({ root, pick: () => 0 }).animationPath('sad')), 'sad_1.mp4');
  assert.equal(path.basename(mascot.animationPath('inventado')), 'idle.mp4');
});

test('o repouso escala com o tempo parado, e reset volta ao começo', () => {
  const timers = new Map(); let next = 0; const states = [];
  const escalation = createIdleEscalation({ onState: (state) => states.push(state), setTimer: (fn, ms) => { next += 1; timers.set(next, { fn, ms }); return next; }, clearTimer: (id) => timers.delete(id) });
  escalation.reset();
  assert.deepEqual([...timers.values()].map((timer) => timer.ms), [30_000, 60_000, 300_000]);
  for (const timer of [...timers.values()]) timer.fn();
  assert.deepEqual(states, ['curious', 'wander', 'sleep']);
  escalation.reset();
  escalation.stop();
  assert.equal(timers.size, 0);
});

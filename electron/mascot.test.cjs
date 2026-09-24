const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ANIMATIONS, ENTRY_CLIP_DURATION_MS, createIdleEscalation, createMascot, createMascotAnimationSequencer, mascotStateFor } = require('./mascot.cjs');

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

test('não repete imediatamente a mesma variação de uma emoção', () => {
  const mascot = createMascot({ root, pick: () => 0 });
  const first = path.basename(mascot.animationPath('happy'));
  const second = path.basename(mascot.animationPath('happy'));
  assert.equal(first, 'happy_1.mp4');
  assert.notEqual(second, first);
});

test('compõe estados transitórios em entrada única, loop estável e retorno ao idle', () => {
  const mascot = createMascot({ root, pick: () => 0 });
  const listening = mascot.sequenceForKind('listening');
  assert.equal(path.basename(listening.entryAnimationPath), 'idle_curious.mp4');
  assert.equal(path.basename(listening.loopAnimationPath), 'listening.mp4');
  assert.equal(path.basename(listening.idleAnimationPath), 'idle.mp4');
  assert.equal(listening.entryAnimationUrl, '/mascot/idle_curious.mp4');
  const result = mascot.sequenceForKind('result');
  assert.match(path.basename(result.entryAnimationPath), /^happy_[1-4]\.mp4$/);
  assert.equal(path.basename(result.loopAnimationPath), 'idle.mp4');
  assert.equal(result.entryAnimationUrl, `/mascot/${path.basename(result.entryAnimationPath)}`);
});

test('resolve os IDs de animação do reducer em clipes do mascote Pixano', () => {
  const mascot = createMascot({ root, pick: () => 0 });

  const listening = mascot.sequenceForAnimation({ entry: 'listening_in', loop: 'listening_loop', reducedMotion: false });
  assert.equal(path.basename(listening.entryAnimationPath), 'idle_curious.mp4');
  assert.equal(path.basename(listening.loopAnimationPath), 'listening.mp4');

  const result = mascot.sequenceForAnimation({ entry: 'task_completed', loop: null, reducedMotion: false });
  assert.match(path.basename(result.entryAnimationPath), /^happy_[1-4]\.mp4$/);
  assert.equal(path.basename(result.loopAnimationPath), 'idle.mp4');
  assert.equal(result.entryAnimationDurationMs, ENTRY_CLIP_DURATION_MS);

  const focus = mascot.sequenceForAnimation({ entry: 'working_laptop_in', loop: 'working_laptop_normal_loop', reducedMotion: false });
  assert.equal(path.basename(focus.entryAnimationPath), 'focus.mp4');
  assert.equal(focus.entryAnimationDurationMs, 6_100, 'o clipe de foco tem seis segundos, portanto não deve ser cortado após quatro');

  const reduced = mascot.sequenceForAnimation({ entry: null, loop: null, staticFrame: 'listening_loop', reducedMotion: true });
  assert.equal(reduced.entryAnimationPath, undefined);
  assert.equal(reduced.loopAnimationPath, undefined);
  assert.equal(reduced.idleAnimationPath, undefined);
  assert.equal(reduced.reducedMotion, true);
});

test('a entrada termina uma vez, passa ao loop e é cancelada por estado novo ou dispensa', () => {
  const timers = new Map(); let next = 0; const transitions = [];
  const sequencer = createMascotAnimationSequencer({
    onLoop: (presentation) => transitions.push(presentation),
    setTimer: (fn, ms) => { const id = ++next; timers.set(id, { fn, ms }); return id; },
    clearTimer: (id) => timers.delete(id),
  });
  const first = { requestId: 'turno-1', entryAnimationPath: '/entry.mp4', loopAnimationPath: '/loop.mp4', idleAnimationPath: '/idle.mp4' };
  assert.equal(sequencer.start({ presentation: first }), true);
  const [firstTimerId, firstTimer] = [...timers.entries()][0];
  assert.equal(firstTimer.ms, ENTRY_CLIP_DURATION_MS);
  timers.delete(firstTimerId);
  firstTimer.fn();
  assert.equal(transitions.length, 1);
  assert.equal(transitions[0].entryAnimationPath, null);
  assert.equal(transitions[0].animationPath, '/loop.mp4');
  assert.equal(sequencer.activeRequestId, null);

  sequencer.start({ presentation: first });
  sequencer.start({ presentation: { ...first, requestId: 'turno-2' } });
  assert.equal(timers.size, 1, 'uma nova apresentação substitui o timer anterior');
  assert.equal(sequencer.cancel('turno-1'), false, 'um pedido antigo não pode cancelar a animação nova');
  assert.equal(sequencer.cancel('turno-2'), true);
  assert.equal(timers.size, 0);
  assert.equal(transitions.length, 1, 'dispensar cancela a troca pendente');
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
